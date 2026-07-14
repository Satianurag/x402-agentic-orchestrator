import { paidRequest, probeQuoteUsdc } from "./x402-client.js";
import { requireServiceBaseUrl } from "../config/chains.js";

function exaBase(): string {
  return requireServiceBaseUrl("EXA_BASE_URL");
}

export async function exaSearch(
  query: string,
  budgetGuard: import("../budget/guard.js").BudgetGuard,
) {
  const base = exaBase();
  return paidRequest(
    `${base}/search`,
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
  const base = exaBase();
  const endpoint = `${base}/search`;
  return probeQuoteUsdc(
    endpoint,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query }),
    },
    `exa ${endpoint}`,
  );
}
