import { paidRequest, probeQuote, type ProbeQuote } from "./x402-client.js";
import { requireServiceBaseUrl, SERVICE_BASE_URLS } from "../config/chains.js";

function firecrawlBase(): string {
  return requireServiceBaseUrl("FIRECRAWL_BASE_URL", SERVICE_BASE_URLS.FIRECRAWL);
}

async function firecrawlProbeRequest(query: string): Promise<ProbeQuote & { endpoint: string }> {
  const endpoint = `${firecrawlBase()}/search`;
  const quote = await probeQuote(
    endpoint,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query }),
    },
    `firecrawl ${endpoint}`,
  );
  return { endpoint, ...quote };
}

export async function firecrawlProbeQuote(query: string): Promise<ProbeQuote & { endpoint: string }> {
  return firecrawlProbeRequest(query);
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
  return (await firecrawlProbeRequest(query)).usdc;
}
