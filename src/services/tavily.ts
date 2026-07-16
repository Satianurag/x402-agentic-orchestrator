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
  const probed = await probeQuoteUsdc(`${BASE}/search`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (probed > 0) return probed;
  try {
    const res = await fetch(`${BASE}/.well-known/pricing`);
    if (res.ok) {
      const pricing = (await res.json()) as { endpoints?: Array<{ price?: string }> };
      const price = pricing.endpoints?.[0]?.price;
      if (price) return parseFloat(price.replace("$", ""));
    }
  } catch {
    /* fallback */
  }
  return 0.01;
}
