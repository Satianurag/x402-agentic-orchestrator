import { paidRequest, probeQuote, type ProbeQuote } from "./x402-client.js";
import { requireServiceBaseUrl, SERVICE_BASE_URLS } from "../config/chains.js";

function tavilyBase(): string {
  return requireServiceBaseUrl("TAVILY_BASE_URL", SERVICE_BASE_URLS.TAVILY);
}

async function tavilyProbeRequest(query: string): Promise<ProbeQuote & { endpoint: string }> {
  const endpoint = `${tavilyBase()}/search`;
  const quote = await probeQuote(
    endpoint,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query }),
    },
    `tavily ${endpoint}`,
  );
  return { endpoint, ...quote };
}

export async function tavilyProbeQuote(query: string): Promise<ProbeQuote & { endpoint: string }> {
  return tavilyProbeRequest(query);
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
  return (await tavilyProbeRequest(query)).usdc;
}
