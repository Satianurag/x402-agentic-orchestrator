import { resolveSuggestedBudget } from "./budget-cap.js";
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
  minimumBudget: number;
  minimumRequired: number;
  preferredFits: boolean;
  probedAt: string;
}

export interface CreateEstimateOptions {
  userToolPicks?: string[];
  budgetCap?: number;
}

export { GoalRejectedError };

export async function createRunEstimate(
  goal: string,
  options: CreateEstimateOptions = {},
): Promise<RunEstimate> {
  const trimmed = goal.trim();
  validateGoal(trimmed);

  const plan = await createPlan(trimmed, { userToolPicks: options.userToolPicks });
  const budget = resolveSuggestedBudget(plan.totalEstUsdc, options.budgetCap);

  return {
    goal: trimmed,
    plan,
    catalog: plan.catalog,
    needs: plan.needs,
    reasoning: plan.reasoning,
    thoughts: plan.thoughts,
    warnings: plan.warnings,
    totalEstUsdc: plan.totalEstUsdc,
    suggestedBudget: budget.suggestedBudget,
    minimumBudget: budget.minimumBudget,
    minimumRequired: budget.minimumRequired,
    preferredFits: budget.preferredFits,
    probedAt: new Date().toISOString(),
  };
}
