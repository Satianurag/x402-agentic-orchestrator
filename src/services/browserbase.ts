import { paidRequest, probeQuoteUsdc } from "./x402-client.js";

const BASE = "https://x402.browserbase.com";

export async function browserbaseCreateSession(
  budgetGuard: import("../budget/guard.js").BudgetGuard,
) {
  return paidRequest(
    `${BASE}/browser/session/create`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    },
    budgetGuard,
    "browserbase",
  );
}

export async function browserbaseEstimateCost(): Promise<number> {
  const probed = await probeQuoteUsdc(`${BASE}/browser/session/create`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  return probed > 0 ? probed : 0.05;
}
