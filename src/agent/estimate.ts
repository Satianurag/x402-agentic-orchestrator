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
  const suggestedBudget = Math.ceil(plan.totalEstUsdc * 1.25 * 100) / 100;

  return {
    goal: trimmed,
    plan,
    catalog: plan.catalog,
    needs: plan.needs,
    reasoning: plan.reasoning,
    thoughts: plan.thoughts,
    warnings: plan.warnings,
    totalEstUsdc: plan.totalEstUsdc,
    suggestedBudget: Math.max(suggestedBudget, 0.05),
    probedAt: new Date().toISOString(),
  };
}
