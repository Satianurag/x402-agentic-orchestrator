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
  /** Lowest limit that can cover paid steps (no buffer). */
  minimumBudget: number;
  suggestedBudget: number;
  maxRunBudget: number;
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
  const minimumBudget = Math.max(plan.totalEstUsdc, 0.01);
  // Recommended = estimate + 25%, rounded up to 1¢.
  const suggestedBudget = Math.max(
    Math.ceil(plan.totalEstUsdc * 1.25 * 100) / 100,
    minimumBudget,
  );

  return {
    goal: trimmed,
    plan,
    catalog: plan.catalog,
    needs: plan.needs,
    reasoning: plan.reasoning,
    thoughts: plan.thoughts,
    warnings: plan.warnings,
    totalEstUsdc: plan.totalEstUsdc,
    minimumBudget,
    suggestedBudget,
    maxRunBudget: 5,
    probedAt: new Date().toISOString(),
  };
}
