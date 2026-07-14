import { paidRequest, probeQuoteUsdc } from "./x402-client.js";
import { requireServiceBaseUrl } from "../config/chains.js";

function tavilyBase(): string {
  return requireServiceBaseUrl("TAVILY_BASE_URL");
}

export async function tavilySearch(
  query: string,
  budgetGuard: import("../budget/guard.js").BudgetGuard,
) {
  const base = tavilyBase();
  return paidRequest(
    `${base}/search`,
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
  const base = tavilyBase();
  const endpoint = `${base}/search`;
  return probeQuoteUsdc(
    endpoint,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query }),
    },
    `tavily ${endpoint}`,
  );
}
