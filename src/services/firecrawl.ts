import { paidRequest, probeQuoteUsdc } from "./x402-client.js";
import { requireServiceBaseUrl } from "../config/chains.js";

function firecrawlBase(): string {
  return requireServiceBaseUrl("FIRECRAWL_BASE_URL");
}

export async function firecrawlSearch(
  query: string,
  budgetGuard: import("../budget/guard.js").BudgetGuard,
) {
  const base = firecrawlBase();
  return paidRequest(
    `${base}/search`,
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
  const base = firecrawlBase();
  const endpoint = `${base}/search`;
  return probeQuoteUsdc(
    endpoint,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query }),
    },
    `firecrawl ${endpoint}`,
  );
}
