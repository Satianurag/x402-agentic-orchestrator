import { synthesizeEstimateCost } from "../services/seller.js";
import { validateGoal } from "./goal-validation.js";
import {
  discoverToolCatalogForPlanning,
  effectiveUsdc,
  findCatalogTool,
  probeSelectedTools,
  type CatalogTool,
} from "./tool-catalog.js";
import { planToolsWithLlm, type PlannerResult, type PlannerWarning } from "./tool-planner.js";

export type PlanStepKind = "mcp" | "synthesize";

export interface PlanStep {
  kind: PlanStepKind;
  /** UI / spend line label */
  service: string;
  label: string;
  endpoint: string;
  estCostUsdc: number;
  mcpToolName?: string;
  proxyParameters?: Record<string, unknown>;
  why?: string;
}

export interface AgentPlan {
  goal: string;
  steps: PlanStep[];
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
    proxyParameters: pick.proxyParameters,
    why: pick.why,
  };
}

export async function createPlan(goal: string, options: CreatePlanOptions = {}): Promise<AgentPlan> {
  const trimmed = goal.trim();
  validateGoal(trimmed);

  const catalog = await discoverToolCatalogForPlanning(trimmed, options.userToolPicks);
  const planner = await planToolsWithLlm(trimmed, catalog, options.userToolPicks);

  const selectedNames = new Set(planner.selectedTools.map((t) => t.mcpToolName));
  const toProbe = catalog.filter((t) => selectedNames.has(t.mcpToolName));
  const probedCatalog = await probeSelectedTools(toProbe, trimmed);

  const probedMap = new Map(probedCatalog.map((t) => [t.mcpToolName, t]));
  const mergedCatalog = catalog.map((t) => probedMap.get(t.mcpToolName) ?? t);

  const researchSteps = planner.selectedTools.map((pick) =>
    mcpStepFromPick(pick, mergedCatalog),
  );

  const synthesizeCost = await synthesizeEstimateCost();
  const synthesizeStep: PlanStep = {
    kind: "synthesize",
    service: "synthesize",
    label: "Synthesize deliverable",
    endpoint: "POST /synthesize (Arbitrum settlement)",
    estCostUsdc: synthesizeCost,
  };

  const steps = [...researchSteps, synthesizeStep];
  const totalEstUsdc = steps.reduce((sum, s) => sum + s.estCostUsdc, 0);

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
