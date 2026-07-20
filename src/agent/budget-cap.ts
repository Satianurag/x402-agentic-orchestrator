/** Shared run-budget rules for API + UI (USDC). */
export const MIN_RUN_BUDGET_USDC = 0.01;
export const MAX_RUN_BUDGET_USDC = 5;

export function clampRunBudget(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return MIN_RUN_BUDGET_USDC;
  return Math.min(Math.max(value, MIN_RUN_BUDGET_USDC), MAX_RUN_BUDGET_USDC);
}

/** Recommended cap: estimate + 25% buffer, rounded up to 1¢. */
export function minimumRunBudget(totalEstUsdc: number): number {
  return Math.max(MIN_RUN_BUDGET_USDC, Math.ceil(totalEstUsdc * 1.25 * 100) / 100);
}

export interface ResolvedRunBudget {
  suggestedBudget: number;
  minimumBudget: number;
  minimumRequired: number;
  preferredFits: boolean;
}

export function resolveSuggestedBudget(
  totalEstUsdc: number,
  preferredCap?: number,
): ResolvedRunBudget {
  const minimumRequired = Math.max(MIN_RUN_BUDGET_USDC, totalEstUsdc);
  const minimumBudget = minimumRunBudget(totalEstUsdc);
  const preferred =
    preferredCap != null && Number.isFinite(preferredCap) && preferredCap > 0
      ? clampRunBudget(preferredCap)
      : minimumBudget;
  const suggestedBudget = clampRunBudget(Math.max(minimumBudget, preferred));
  return {
    suggestedBudget,
    minimumBudget,
    minimumRequired,
    preferredFits: preferred >= minimumRequired,
  };
}
