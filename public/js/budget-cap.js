/** Mirror of src/agent/budget-cap.ts for the browser bundle. */
export const MIN_RUN_BUDGET_USDC = 0.01;
export const MAX_RUN_BUDGET_USDC = 5;

export function clampRunBudget(value) {
  if (!Number.isFinite(value) || value <= 0) return MIN_RUN_BUDGET_USDC;
  return Math.min(Math.max(value, MIN_RUN_BUDGET_USDC), MAX_RUN_BUDGET_USDC);
}

export function minimumRunBudget(totalEstUsdc) {
  return Math.max(MIN_RUN_BUDGET_USDC, Math.ceil(totalEstUsdc * 1.25 * 100) / 100);
}

export function resolveSuggestedBudget(totalEstUsdc, preferredCap) {
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
