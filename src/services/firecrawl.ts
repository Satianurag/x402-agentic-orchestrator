import { paidRequest, probeQuoteUsdc } from "./x402-client.js";

const BASE = "https://api.firecrawl.dev/v1/x402";

export async function firecrawlSearch(
  query: string,
  budgetGuard: import("../budget/guard.js").BudgetGuard,
) {
  return paidRequest(
    `${BASE}/search`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, limit: 5 }),
    },
    budgetGuard,
    "firecrawl",
  );
}

export async function firecrawlEstimateCost(query: string): Promise<number> {
  const probed = await probeQuoteUsdc(`${BASE}/search`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query }),
  });
  return probed > 0 ? probed : 0.02;
}
