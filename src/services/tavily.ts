import { paidRequest, probeQuoteUsdc } from "./x402-client.js";

const BASE = "https://x402.tavily.com";

export async function tavilySearch(
  query: string,
  budgetGuard: import("../budget/guard.js").BudgetGuard,
) {
  return paidRequest(
    `${BASE}/search`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, max_results: 5 }),
    },
    budgetGuard,
    "tavily",
  );
}

export async function tavilyEstimateCost(query: string): Promise<number> {
  return probeQuoteUsdc(`${BASE}/search`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query }),
  });
}
