import { paidRequest, probeQuoteUsdc } from "./x402-client.js";

const BASE = "https://api.exa.ai";

export async function exaSearch(
  query: string,
  budgetGuard: import("../budget/guard.js").BudgetGuard,
) {
  return paidRequest(
    `${BASE}/search`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, numResults: 5 }),
    },
    budgetGuard,
    "exa",
  );
}

export async function exaEstimateCost(query: string): Promise<number> {
  const probed = await probeQuoteUsdc(`${BASE}/search`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query }),
  });
  return probed > 0 ? probed : 0.01;
}
