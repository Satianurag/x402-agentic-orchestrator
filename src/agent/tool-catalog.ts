import { atomicToUsdc } from "../config/chains.js";
import { probeQuote } from "../services/x402-client.js";
import { mcpSearchResources } from "./bazaar-mcp.js";

/** Tool entry from Bazaar MCP `search_resources` (CDP discovery catalog). */
export interface CatalogTool {
  mcpToolName: string;
  displayName: string;
  description: string;
  catalogUsdc: number | null;
  probeUsdc: number | null;
  network: string | null;
  payers30d: number | null;
  calls30d: number | null;
  inputSchema?: Record<string, unknown>;
  httpResource: string | null;
}

type McpToolRaw = {
  name?: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  _meta?: {
    "x402/payment-required"?: {
      accepts?: Array<{ amount?: string; network?: string }>;
    };
    "x402/guidance"?: { costObservedUsd?: string };
    "x402/curation"?: { curated?: boolean };
  };
};

function displayNameFromTool(tool: McpToolRaw): string {
  const desc = tool.description ?? "";
  const dash = desc.indexOf(" — ");
  if (dash > 0) return desc.slice(0, dash).trim();
  const guide = desc.indexOf(" Guide:");
  if (guide > 0) return desc.slice(0, guide).trim();
  return (tool.name ?? "tool").replace(/^x402_(get|post)_https___/i, "").slice(0, 64);
}

function catalogUsdcFromTool(tool: McpToolRaw): number | null {
  const guidance = tool._meta?.["x402/guidance"]?.costObservedUsd;
  if (guidance) {
    const n = Number(guidance);
    if (Number.isFinite(n)) return n;
  }
  const amount = tool._meta?.["x402/payment-required"]?.accepts?.[0]?.amount;
  if (!amount) return null;
  try {
    return atomicToUsdc(amount);
  } catch {
    return null;
  }
}

function networkFromTool(tool: McpToolRaw): string | null {
  return tool._meta?.["x402/payment-required"]?.accepts?.[0]?.network ?? null;
}

function qualityFromDescription(desc: string): { payers: number | null; calls: number | null } {
  const m = desc.match(/(\d+) calls from (\d+) unique payers/i);
  if (!m) return { payers: null, calls: null };
  return { payers: Number(m[2]), calls: Number(m[1]) };
}

function httpResourceFromName(name: string): string | null {
  const m = name.match(/^x402_(get|post)_https___(.+?)_[a-f0-9]+_/i);
  if (!m) return null;
  const path = m[2].replace(/_/g, "/").replace(/\/+/g, (s, i) => (i === 0 ? s : "/"));
  return `https://${path}`;
}

/** Parse full MCP `search_resources` payload into catalog tools. */
export function parseMcpCatalogTools(result: unknown): CatalogTool[] {
  const content = (result as { content?: Array<{ text?: string }> })?.content;
  const text = content?.[0]?.text;
  if (!text) return [];

  try {
    const parsed = JSON.parse(text) as { tools?: McpToolRaw[] };
    return (parsed.tools ?? [])
      .filter((t): t is McpToolRaw & { name: string } => typeof t.name === "string")
      .map((t) => {
        const desc = t.description ?? "";
        const quality = qualityFromDescription(desc);
        return {
          mcpToolName: t.name,
          displayName: displayNameFromTool(t),
          description: desc.slice(0, 400),
          catalogUsdc: catalogUsdcFromTool(t),
          probeUsdc: null,
          network: networkFromTool(t),
          payers30d: quality.payers,
          calls30d: quality.calls,
          inputSchema: t.inputSchema,
          httpResource: httpResourceFromName(t.name),
        };
      });
  } catch {
    return [];
  }
}

async function probeCatalogTool(tool: CatalogTool, goal: string): Promise<CatalogTool> {
  if (!tool.httpResource) return tool;

  const method =
    tool.mcpToolName.startsWith("x402_get_") ? "GET" : "POST";
  let url = tool.httpResource;
  let init: RequestInit;

  if (method === "GET") {
    const u = new URL(url);
    if (!u.searchParams.has("q") && !u.searchParams.has("query")) {
      u.searchParams.set("query", goal.slice(0, 80));
    }
    url = u.toString();
    init = { method: "GET" };
  } else {
    init = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: goal.slice(0, 200) }),
    };
  }

  try {
    const q = await probeQuote(url, init, tool.displayName);
    return { ...tool, probeUsdc: q.usdc, network: q.network };
  } catch {
    return tool;
  }
}

/** Discover Bazaar MCP tools for a goal (semantic search + dedupe). */
export async function discoverToolCatalog(goal: string, limit = 24): Promise<CatalogTool[]> {
  const result = await mcpSearchResources(goal);
  const tools = parseMcpCatalogTools(result);
  const seen = new Set<string>();
  const out: CatalogTool[] = [];

  for (const t of tools) {
    if (seen.has(t.mcpToolName)) continue;
    seen.add(t.mcpToolName);
    out.push(t);
    if (out.length >= limit) break;
  }

  return out;
}

/** Merge catalogs from goal + optional user pick queries (deduped). */
export async function discoverToolCatalogForPlanning(
  goal: string,
  userToolPicks?: string[],
  limit = 28,
): Promise<CatalogTool[]> {
  const seen = new Set<string>();
  const out: CatalogTool[] = [];

  const add = (tools: CatalogTool[]) => {
    for (const t of tools) {
      if (seen.has(t.mcpToolName)) continue;
      seen.add(t.mcpToolName);
      out.push(t);
    }
  };

  add(await discoverToolCatalog(goal, limit));
  for (const pick of userToolPicks ?? []) {
    if (out.length >= limit) break;
    add(await discoverToolCatalog(pick, 10));
  }

  return out.slice(0, limit);
}

/** Live 402 probe on planner-selected tools (best-effort). */
export async function probeSelectedTools(
  tools: CatalogTool[],
  goal: string,
): Promise<CatalogTool[]> {
  const probed: CatalogTool[] = [];
  for (const tool of tools) {
    probed.push(await probeCatalogTool(tool, goal));
  }
  return probed;
}

export function findCatalogTool(catalog: CatalogTool[], mcpToolName: string): CatalogTool | undefined {
  return catalog.find((t) => t.mcpToolName === mcpToolName);
}

export function effectiveUsdc(tool: CatalogTool): number {
  return tool.probeUsdc ?? tool.catalogUsdc ?? 0;
}
