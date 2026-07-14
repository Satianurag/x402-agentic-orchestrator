import { paidRequest, probeQuoteUsdc } from "./x402-client.js";
import { requireServiceBaseUrl } from "../config/chains.js";

function browserbaseBase(): string {
  return requireServiceBaseUrl("BROWSERBASE_BASE_URL");
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
      body: JSON.stringify({}),
    },
    budgetGuard,
    "browserbase",
  );
}

export async function browserbaseEstimateCost(): Promise<number> {
  const base = browserbaseBase();
  const endpoint = `${base}/browser/session/create`;
  return probeQuoteUsdc(
    endpoint,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    },
    `browserbase ${endpoint}`,
  );
}
