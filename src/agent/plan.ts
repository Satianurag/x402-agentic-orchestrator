import { validateGoal } from "./goal-validation.js";
import {
  discoverToolCatalogForPlanning,
  effectiveUsdc,
  findCatalogTool,
  probeSelectedTools,
  type CatalogTool,
} from "./tool-catalog.js";
import { applyPlannerGuards } from "./planner-guards.js";
import { planToolsWithLlm, type PlannerResult, type PlannerWarning } from "./tool-planner.js";

export type PlanStepKind = "mcp" | "compose";

export interface PlanStep {
  kind: PlanStepKind;
  /** UI / spend line label */
  service: string;
  label: string;
  endpoint: string;
  /** x402 USDC estimate — 0 for local compose (not billed to user). */
  estCostUsdc: number;
  mcpToolName?: string;
  proxyParameters?: Record<string, unknown>;
  why?: string;
}

export interface AgentPlan {
  goal: string;
  steps: PlanStep[];
  /** Sum of paid x402 steps only (compose excluded). */
  totalEstUsdc: number;
  needs: string[];
  reasoning: string;
  thoughts: string;
  warnings: PlannerWarning[];
  catalog: CatalogTool[];
}

export interface CreatePlanOptions {
  userToolPicks?: string[];
}

/**
 * Ensure proxyParameters match Bazaar wire format and aren't empty for POST dispatchers.
 * Example: asistent `/x402/query` requires `{ body: { tool, input } }`.
 */
function coerceProxyParameters(
  pick: PlannerResult["selectedTools"][number],
  tool: CatalogTool | undefined,
): Record<string, unknown> {
  const raw = { ...(pick.proxyParameters ?? {}) };
  const example = tool?.exampleInput ?? null;
  const method =
    tool?.httpMethod ?? (pick.mcpToolName.startsWith("x402_get_") ? "GET" : "POST");

  const inner =
    raw.parameters && typeof raw.parameters === "object" && !Array.isArray(raw.parameters)
      ? (raw.parameters as Record<string, unknown>)
      : raw;

  if (method === "GET") {
    if (inner.query && typeof inner.query === "object") return { query: inner.query };
    const { query: _q, body: _b, headers, ...rest } = inner;
    const query = Object.keys(rest).length ? rest : (example ?? {});
    return Object.keys(query).length ? { query } : {};
  }

  let body: Record<string, unknown>;
  if (inner.body && typeof inner.body === "object" && !Array.isArray(inner.body)) {
    body = { ...(inner.body as Record<string, unknown>) };
  } else {
    const { query: _q, body: _b, headers: _h, parameters: _p, ...rest } = inner;
    body = { ...rest };
  }

  if (example) {
    const needsTool = "tool" in example && !("tool" in body);
    const empty = Object.keys(body).length === 0;
    if (empty || needsTool) {
      body = { ...example, ...body };
    }
  }

  if (Object.keys(body).length === 0 && example) body = { ...example };
  return { body };
}

function mcpStepFromPick(pick: PlannerResult["selectedTools"][number], catalog: CatalogTool[]): PlanStep {
  const tool = findCatalogTool(catalog, pick.mcpToolName);
  const est = tool ? effectiveUsdc(tool) : pick.estimatedUsdc;
  return {
    kind: "mcp",
    service: pick.displayName,
    label: pick.displayName,
    endpoint: `MCP proxy_tool_call → ${pick.mcpToolName}`,
    estCostUsdc: est || pick.estimatedUsdc,
    mcpToolName: pick.mcpToolName,
    proxyParameters: coerceProxyParameters(pick, tool),
    why: pick.why,
  };
}

export async function createPlan(goal: string, options: CreatePlanOptions = {}): Promise<AgentPlan> {
  const trimmed = goal.trim();
  validateGoal(trimmed);

  const catalog = await discoverToolCatalogForPlanning(trimmed, options.userToolPicks);
  const rawPlanner = await planToolsWithLlm(trimmed, catalog, options.userToolPicks);
  const planner = applyPlannerGuards(trimmed, rawPlanner, catalog);

  if (planner.selectedTools.length === 0) {
    throw new Error(
      "No affordable primary-source tools left after planning guards. " +
        "Try a more specific goal, or pick tools manually from the catalog.",
    );
  }

  const selectedNames = new Set(planner.selectedTools.map((t) => t.mcpToolName));
  const toProbe = catalog.filter((t) => selectedNames.has(t.mcpToolName));
  const probedCatalog = await probeSelectedTools(toProbe, trimmed);

  const probedMap = new Map(probedCatalog.map((t) => [t.mcpToolName, t]));
  const mergedCatalog = catalog.map((t) => probedMap.get(t.mcpToolName) ?? t);

  const researchSteps = planner.selectedTools.map((pick) => mcpStepFromPick(pick, mergedCatalog));

  // Local Gemini compose — platform cost, $0 on user x402 ledger.
  const composeStep: PlanStep = {
    kind: "compose",
    service: "compose",
    label: "Compose deliverable (included)",
    endpoint: "local Gemini · not billed via x402",
    estCostUsdc: 0,
    why: "Our LLM formats paid tool results — not charged to your USDC budget.",
  };

  const steps = [...researchSteps, composeStep];
  const totalEstUsdc = researchSteps.reduce((sum, s) => sum + s.estCostUsdc, 0);

  return {
    goal: trimmed,
    steps,
    totalEstUsdc,
    needs: planner.needs,
    reasoning: planner.reasoning,
    thoughts: planner.thoughts,
    warnings: planner.warnings,
    catalog: mergedCatalog,
  };
}
