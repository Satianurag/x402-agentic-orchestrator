import { paidRequest, probeQuoteUsdc } from "./x402-client.js";
import { requireServiceBaseUrl } from "../config/chains.js";

function coingeckoBase(): string {
  return requireServiceBaseUrl("COINGECKO_BASE_URL");
}

export async function coingeckoPrice(
  ids: string[],
  vsCurrencies: string[],
  budgetGuard: import("../budget/guard.js").BudgetGuard,
) {
  const base = coingeckoBase();
  const params = new URLSearchParams({
    ids: ids.join(","),
    vs_currencies: vsCurrencies.join(","),
  });
  const endpoint = `${base}/x402/simple/price?${params}`;
  return paidRequest(endpoint, { method: "GET" }, budgetGuard, "coingecko");
}

export async function coingeckoEstimateCost(): Promise<number> {
  const base = coingeckoBase();
  const endpoint = `${base}/x402/simple/price?ids=bitcoin&vs_currencies=usd`;
  return probeQuoteUsdc(endpoint, { method: "GET" }, `coingecko ${endpoint}`);
}
