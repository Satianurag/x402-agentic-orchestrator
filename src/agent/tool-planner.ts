import { GoogleGenAI } from "@google/genai";
import type { CatalogTool } from "./tool-catalog.js";

const GEMINI_MODEL = "gemini-3.1-flash-lite";

const PLANNER_SYSTEM =
  "You are an expert x402 Bazaar tool planner for a cost-sensitive autonomous agent. " +
  "Paid tools cost real USDC; our local LLM compose is FREE and must NOT be replaced by buying LLM-written briefs/reports. " +
  "Select the MINIMUM set of PRIMARY-SOURCE tools (live prices, news with URLs, raw APIs) that fulfill live-data needs. " +
  "Do NOT select tools described as LLM-written briefings/reports/'one call the whole market' — we compose locally. " +
  "If the goal asks for multiple assets (e.g. BTC+ETH+SOL prices), pick tools that cover EACH asset — never BTC-only for a multi-asset goal. " +
  "Prefer lower cost when capability is comparable. Prefer higher unique payer counts; avoid 0–1 payer tools when better options exist. " +
  "Prefer curated tools when marked. " +
  "Avoid low-level dispatcher endpoints that require an internal `tool` enum unless the user explicitly asks for that metric. " +
  "If the user manually selected tools, validate whether each can fulfill the goal; warn when mismatched and suggest better alternatives. " +
  "proxyParameters must match the tool's wire format: " +
  "GET tools → { query: { ...queryParams } }; POST tools → { body: { ...jsonBody } }. " +
  "Use exampleInput from the catalog as the shape template and fill values for the goal. " +
  "Never invent tool names — only use mcpToolName values from the catalog.";

export interface PlannerWarning {
  issue: string;
  reason: string;
  alternatives: string[];
}

export interface PlannerToolPick {
  mcpToolName: string;
  displayName: string;
  why: string;
  proxyParameters: Record<string, unknown>;
  estimatedUsdc: number;
}

export interface PlannerResult {
  needs: string[];
  selectedTools: PlannerToolPick[];
  warnings: PlannerWarning[];
  reasoning: string;
  /** Gemini extended thinking (when returned by the model). */
  thoughts: string;
}

const PLANNER_JSON_SCHEMA = {
  type: "object",
  properties: {
    needs: {
      type: "array",
      items: { type: "string" },
      description: "High-level capabilities required for the goal",
    },
    selectedTools: {
      type: "array",
      items: {
        type: "object",
        properties: {
          mcpToolName: { type: "string" },
          displayName: { type: "string" },
          why: { type: "string" },
          proxyParameters: { type: "object" },
          estimatedUsdc: { type: "number" },
        },
        required: ["mcpToolName", "displayName", "why", "proxyParameters", "estimatedUsdc"],
      },
    },
    warnings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          issue: { type: "string" },
          reason: { type: "string" },
          alternatives: { type: "array", items: { type: "string" } },
        },
        required: ["issue", "reason", "alternatives"],
      },
    },
    reasoning: { type: "string" },
  },
  required: ["needs", "selectedTools", "warnings", "reasoning"],
} as const;

function formatCatalogForLlm(catalog: CatalogTool[]): string {
  return catalog
    .map((t, i) => {
      const price = t.probeUsdc ?? t.catalogUsdc;
      const priceStr = price != null ? `$${price.toFixed(6)}` : "unknown";
      const quality =
        t.payers30d != null ? ` | ${t.payers30d} payers / ${t.calls30d ?? "?"} calls (30d)` : "";
      const curated = t.curated ? " | curated" : "";
      const method = t.httpMethod ? ` | ${t.httpMethod}` : "";
      const example = t.exampleInput
        ? `\n   exampleInput: ${JSON.stringify(t.exampleInput)}`
        : "";
      const shape =
        t.httpMethod === "GET"
          ? "\n   proxyParameters shape: { \"query\": { ... } }"
          : t.httpMethod === "POST"
            ? "\n   proxyParameters shape: { \"body\": { ... } }"
            : "";
      return (
        `${i + 1}. mcpToolName: ${t.mcpToolName}\n` +
        `   displayName: ${t.displayName}\n` +
        `   price: ${priceStr}${quality}${curated}${method}\n` +
        `   description: ${t.description.slice(0, 280)}` +
        example +
        shape
      );
    })
    .join("\n\n");
}

function extractThoughtsAndJson(response: Awaited<ReturnType<GoogleGenAI["models"]["generateContent"]>>): {
  thoughts: string;
  jsonText: string;
} {
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  let thoughts = "";
  let jsonText = "";

  for (const part of parts) {
    if (!part.text) continue;
    if (part.thought) thoughts += `${part.text}\n`;
    else jsonText += part.text;
  }

  if (!jsonText && response.text) jsonText = response.text;
  return { thoughts: thoughts.trim(), jsonText: jsonText.trim() };
}

function validatePicks(result: PlannerResult, catalog: CatalogTool[]): PlannerResult {
  const names = new Set(catalog.map((t) => t.mcpToolName));
  const selectedTools = result.selectedTools.filter((p) => names.has(p.mcpToolName));
  const dropped = result.selectedTools.filter((p) => !names.has(p.mcpToolName));
  const warnings = [...result.warnings];
  if (dropped.length > 0) {
    warnings.push({
      issue: "Planner returned unknown tool names",
      reason: `Dropped picks not in catalog: ${dropped.map((d) => d.mcpToolName).join(", ")}`,
      alternatives: catalog.slice(0, 3).map((t) => t.displayName),
    });
  }
  return { ...result, selectedTools, warnings };
}

export async function planToolsWithLlm(
  goal: string,
  catalog: CatalogTool[],
  userToolPicks?: string[],
): Promise<PlannerResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is required for LLM tool planning");

  if (catalog.length === 0) {
    throw new Error("Bazaar catalog empty — cannot plan tools for this goal");
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { retryOptions: { attempts: 5 } },
  });

  const userPickBlock = userToolPicks?.length
    ? `\nUSER MANUALLY REQUESTED TOOLS (validate these):\n${userToolPicks.map((p) => `- ${p}`).join("\n")}\n`
    : "";

  const prompt =
    `GOAL:\n${goal}\n\n` +
    `BAZAAR MCP TOOL CATALOG (invoke only via proxy_tool_call):\n${formatCatalogForLlm(catalog)}` +
    userPickBlock;

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
    config: {
      systemInstruction: PLANNER_SYSTEM,
      thinkingConfig: { includeThoughts: true },
      responseMimeType: "application/json",
      responseJsonSchema: PLANNER_JSON_SCHEMA,
    },
  });

  const { thoughts, jsonText } = extractThoughtsAndJson(response);
  if (!jsonText) throw new Error("Gemini planner returned empty JSON");

  const parsed = JSON.parse(jsonText) as Omit<PlannerResult, "thoughts">;
  return validatePicks({ ...parsed, thoughts }, catalog);
}
