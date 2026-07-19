/** Run budget limits — keep in sync with server `MAX_RUN_BUDGET_USDC`. */
export const MIN_RUN_BUDGET_USDC = 0.01;
export const MAX_RUN_BUDGET_USDC = 5;
export const DEFAULT_RUN_BUDGET_USDC = 0.15;

/** Round up to cents. */
export function roundBudgetUp(usdc) {
  return Math.ceil(usdc * 100) / 100;
}

export function clampRunBudget(usdc) {
  if (!Number.isFinite(usdc)) return DEFAULT_RUN_BUDGET_USDC;
  return Math.min(MAX_RUN_BUDGET_USDC, Math.max(MIN_RUN_BUDGET_USDC, roundBudgetUp(usdc)));
}

/** Minimum to cover the plan (no buffer). */
export function minimumRunBudget(estimatedCostUsdc) {
  const est = Number(estimatedCostUsdc);
  if (!Number.isFinite(est) || est <= 0) return MIN_RUN_BUDGET_USDC;
  return clampRunBudget(est);
}

/** Recommended = estimate + 25% buffer, rounded up. */
export function recommendedRunBudget(estimatedCostUsdc) {
  const est = Number(estimatedCostUsdc);
  if (!Number.isFinite(est) || est <= 0) return DEFAULT_RUN_BUDGET_USDC;
  return clampRunBudget(Math.max(est * 1.25, est + 0.01));
}

/** Comfortable = estimate + 50% buffer. */
export function comfortableRunBudget(estimatedCostUsdc) {
  const est = Number(estimatedCostUsdc);
  if (!Number.isFinite(est) || est <= 0) return DEFAULT_RUN_BUDGET_USDC;
  return clampRunBudget(Math.max(est * 1.5, est + 0.02));
}

export function parseRunBudgetInput(raw) {
  const n = typeof raw === "number" ? raw : parseFloat(String(raw ?? "").trim());
  if (!Number.isFinite(n)) return null;
  return clampRunBudget(n);
}

/**
 * @returns {{ state: 'ok'|'warn'|'error', message: string, canRun: boolean }}
 */
export function evaluateProbeGate({ probeGateOk = true, probeFailures = [] } = {}) {
  if (probeGateOk !== false) {
    return { state: "ok", message: "", canRun: true };
  }
  const first = probeFailures[0];
  const message = first
    ? `Preflight blocked: ${first.service} — ${first.detail}`
    : "One or more tools failed preflight. Re-check price or pick another tool.";
  return { state: "error", message, canRun: false };
}

/**
 * @returns {{ state: 'ok'|'warn'|'error', message: string, canRun: boolean }}
 */
export function evaluateRunBudget({ runLimit, estimatedCost, walletCredit }) {
  const limit = parseRunBudgetInput(runLimit);
  if (limit == null) {
    return {
      state: "error",
      message: "Enter a valid run limit between $0.01 and $5.00 USDC.",
      canRun: false,
    };
  }

  const est = Number(estimatedCost) || 0;
  if (est > 0 && limit < est) {
    return {
      state: "error",
      message: `Limit ${formatBudget(limit)} is below the estimated cost ${formatBudget(est)}. Raise the limit or check price again.`,
      canRun: false,
    };
  }

  if (walletCredit != null && walletCredit > 0 && limit > walletCredit) {
    return {
      state: "warn",
      message: `Limit ${formatBudget(limit)} exceeds available credit ${formatBudget(walletCredit)}. Add funds or lower the limit — the run may fail mid-way.`,
      canRun: true,
    };
  }

  if (est > 0 && limit < recommendedRunBudget(est)) {
    return {
      state: "warn",
      message: `Limit covers the estimate but has little buffer. Recommended: ${formatBudget(recommendedRunBudget(est))}.`,
      canRun: true,
    };
  }

  return {
    state: "ok",
    message: `Limit ${formatBudget(limit)} covers the estimated ${formatBudget(est)} with room to spare.`,
    canRun: true,
  };
}

export function formatBudget(usdc) {
  return `$${Number(usdc).toFixed(2)}`;
}
