import { paidRequest, probeQuote, type ProbeQuote } from "./x402-client.js";
import { requireServiceBaseUrl, SERVICE_BASE_URLS } from "../config/chains.js";

function coingeckoBase(): string {
  return requireServiceBaseUrl("COINGECKO_BASE_URL", SERVICE_BASE_URLS.COINGECKO);
}

async function coingeckoProbeRequest(): Promise<ProbeQuote & { endpoint: string }> {
  const endpoint = `${coingeckoBase()}/x402/simple/price?symbols=btc&vs_currencies=usd`;
  const quote = await probeQuote(endpoint, { method: "GET" }, `coingecko ${endpoint}`);
  return { endpoint, ...quote };
}

export async function coingeckoProbeQuote(): Promise<ProbeQuote & { endpoint: string }> {
  return coingeckoProbeRequest();
}

export async function coingeckoPrice(
  symbols: string[],
  vsCurrencies: string[],
  budgetGuard: import("../budget/guard.js").BudgetGuard,
) {
  const base = coingeckoBase();
  const params = new URLSearchParams({
    symbols: symbols.join(","),
    vs_currencies: vsCurrencies.join(","),
  });
  const endpoint = `${base}/x402/simple/price?${params}`;
  return paidRequest(endpoint, { method: "GET" }, budgetGuard, "coingecko");
}

export async function coingeckoEstimateCost(): Promise<number> {
  return (await coingeckoProbeRequest()).usdc;
}
