#!/usr/bin/env node
/**
 * Reproduces Node undici "duplex option is required when sending a body"
 * and verifies snapshotRequestInit + fetchWithRetry fix.
 */
import { fetchWithRetry, snapshotRequestInit } from "../src/services/http-retry.js";

async function main() {
  const payload = JSON.stringify({ ticker: "TSLA" });
  const req = new Request("https://pay.alephant.io/x402/stock-analysis-tool", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: payload,
  });

  // This mirrors wrapFetchWithPayment passing a Request with stream body into our wrapper.
  const init = await snapshotRequestInit(req);
  const res = await fetchWithRetry(req.url, init, {
    label: "duplex-fix-probe",
    attempts: 1,
  });

  console.log(`status=${res.status} (expect 402)`);
  if (res.status !== 402) {
    throw new Error(`Expected 402, got ${res.status}`);
  }
  console.log("=== duplex fix verified ===");
}

main().catch((err) => {
  console.error("FAILED:", err.message);
  process.exit(1);
});
