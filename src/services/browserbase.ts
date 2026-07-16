import { paidRequest, probeQuote, type ProbeQuote } from "./x402-client.js";
import { requireServiceBaseUrl, SERVICE_BASE_URLS } from "../config/chains.js";

function browserbaseBase(): string {
  return requireServiceBaseUrl("BROWSERBASE_BASE_URL", SERVICE_BASE_URLS.BROWSERBASE);
}

async function browserbaseProbeRequest(): Promise<ProbeQuote & { endpoint: string }> {
  const endpoint = `${browserbaseBase()}/browser/session/create`;
  const quote = await probeQuote(
    endpoint,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ estimatedMinutes: 1 }),
    },
    `browserbase ${endpoint}`,
  );
  return { endpoint, ...quote };
}

export async function browserbaseProbeQuote(): Promise<ProbeQuote & { endpoint: string }> {
  return browserbaseProbeRequest();
}

export async function browserbaseCreateSession(
  budgetGuard: import("../budget/guard.js").BudgetGuard,
) {
  const base = browserbaseBase();
  return paidRequest(
    `${base}/browser/session/create`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ estimatedMinutes: 1 }),
    },
    budgetGuard,
    "browserbase",
  );
}

export async function browserbaseEstimateCost(): Promise<number> {
  return (await browserbaseProbeRequest()).usdc;
}
