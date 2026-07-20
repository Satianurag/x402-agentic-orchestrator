import { createPlan, type AgentPlan } from "./plan.js";
import { validateGoal, GoalRejectedError } from "./goal-validation.js";
import type { CatalogTool } from "./tool-catalog.js";
import type { PlannerWarning } from "./tool-planner.js";

export interface RunEstimate {
  goal: string;
  plan: AgentPlan;
  catalog: CatalogTool[];
  needs: string[];
  reasoning: string;
  thoughts: string;
  warnings: PlannerWarning[];
  totalEstUsdc: number;
  suggestedBudget: number;
  probedAt: string;
}

export interface CreateEstimateOptions {
  userToolPicks?: string[];
}

export { GoalRejectedError };

export async function createRunEstimate(
  goal: string,
  options: CreateEstimateOptions = {},
): Promise<RunEstimate> {
  const trimmed = goal.trim();
  validateGoal(trimmed);

  const plan = await createPlan(trimmed, { userToolPicks: options.userToolPicks });
  // Cap = estimate + 25%, rounded up to 1¢. No artificial $0.05 floor —
  // that forced low-balance testers to lock 16× a $0.003 run before spend.
  const suggestedBudget = Math.max(Math.ceil(plan.totalEstUsdc * 1.25 * 100) / 100, 0.01);

  return {
    goal: trimmed,
    plan,
    catalog: plan.catalog,
    needs: plan.needs,
    reasoning: plan.reasoning,
    thoughts: plan.thoughts,
    warnings: plan.warnings,
    totalEstUsdc: plan.totalEstUsdc,
    suggestedBudget,
    probedAt: new Date().toISOString(),
  };
}
