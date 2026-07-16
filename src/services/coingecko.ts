import { paidRequest, probeQuoteUsdc } from "./x402-client.js";

const BASE = "https://api.coingecko.com";

export async function coingeckoPrice(
  ids: string[],
  vsCurrencies: string[],
  budgetGuard: import("../budget/guard.js").BudgetGuard,
) {
  const params = new URLSearchParams({
    ids: ids.join(","),
    vs_currencies: vsCurrencies.join(","),
  });
  return paidRequest(`${BASE}/x402/simple/price?${params}`, { method: "GET" }, budgetGuard, "coingecko");
}

export async function coingeckoEstimateCost(): Promise<number> {
  return probeQuoteUsdc(`${BASE}/x402/simple/price?ids=bitcoin&vs_currencies=usd`, { method: "GET" });
}
