import { paidRequest } from "./x402-client.js";

export async function synthesizeDeliverable(
  goal: string,
  context: unknown[],
  budgetGuard: import("../budget/guard.js").BudgetGuard,
) {
  const base = process.env.SELLER_BASE_URL ?? `http://localhost:${process.env.PORT ?? 4020}`;
  return paidRequest(
    `${base}/synthesize`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ goal, context }),
    },
    budgetGuard,
    "synthesize",
  );
}

export const SYNTHESIZE_EST_COST_USDC = 0.002;
