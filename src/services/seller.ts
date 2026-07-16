import { paidRequest, probeQuoteUsdc } from "./x402-client.js";

/** Must match paymentMiddleware price in server/seller.ts */
export const SELLER_PRICE_USDC = 0.002;

function sellerBase(): string {
  const base = process.env.SELLER_BASE_URL;
  if (!base) throw new Error("SELLER_BASE_URL is required");
  return base.replace(/\/$/, "");
}

export async function synthesizeDeliverable(
  goal: string,
  context: unknown[],
  budgetGuard: import("../budget/guard.js").BudgetGuard,
) {
  const endpoint = `${sellerBase()}/synthesize`;
  return paidRequest(
    endpoint,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ goal, context }),
    },
    budgetGuard,
    "synthesize",
  );
}

export async function synthesizeEstimateCost(): Promise<number> {
  const endpoint = `${sellerBase()}/synthesize`;
  return probeQuoteUsdc(
    endpoint,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ goal: "probe", context: [] }),
    },
    `synthesize ${endpoint}`,
  );
}
