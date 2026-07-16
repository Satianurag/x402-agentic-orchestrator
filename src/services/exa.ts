import { paidRequest, probeQuote, type ProbeQuote } from "./x402-client.js";
import { requireServiceBaseUrl, SERVICE_BASE_URLS } from "../config/chains.js";

function exaBase(): string {
  return requireServiceBaseUrl("EXA_BASE_URL", SERVICE_BASE_URLS.EXA);
}

async function exaProbeRequest(query: string): Promise<ProbeQuote & { endpoint: string }> {
  const endpoint = `${exaBase()}/search`;
  const quote = await probeQuote(
    endpoint,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, numResults: 5 }),
    },
    `exa ${endpoint}`,
  );
  return { endpoint, ...quote };
}

export async function exaProbeQuote(query: string): Promise<ProbeQuote & { endpoint: string }> {
  return exaProbeRequest(query);
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
  return (await exaProbeRequest(query)).usdc;
}
