#!/usr/bin/env node
/**
 * $0 live x402 price probe — unpaid HTTP 402 reads only.
 * No wallet, no signing, no payment, no UA top-up.
 */
import "dotenv/config";
import { createPlan } from "../src/agent/plan.js";
import { tavilyEstimateCost, tavilyProbeQuote } from "../src/services/tavily.js";
import { coingeckoEstimateCost, coingeckoProbeQuote } from "../src/services/coingecko.js";
import { firecrawlEstimateCost, firecrawlProbeQuote } from "../src/services/firecrawl.js";
import { browserbaseEstimateCost, browserbaseProbeQuote } from "../src/services/browserbase.js";
import { exaEstimateCost, exaProbeQuote } from "../src/services/exa.js";

process.env.NETWORK = "mainnet";

const SAMPLE_GOAL = process.env.E2E_GOAL ?? "BTC price brief with cited web context";
const BUDGET_USDC = Number(process.env.E2E_BUDGET ?? 0.15);

const PROBE_TARGETS = [
  { service: "tavily", probe: () => tavilyProbeQuote(SAMPLE_GOAL), estimate: () => tavilyEstimateCost(SAMPLE_GOAL) },
  { service: "coingecko", probe: () => coingeckoProbeQuote(), estimate: () => coingeckoEstimateCost() },
  { service: "firecrawl", probe: () => firecrawlProbeQuote(SAMPLE_GOAL), estimate: () => firecrawlEstimateCost(SAMPLE_GOAL) },
  { service: "browserbase", probe: () => browserbaseProbeQuote(), estimate: () => browserbaseEstimateCost() },
  { service: "exa", probe: () => exaProbeQuote(SAMPLE_GOAL), estimate: () => exaEstimateCost(SAMPLE_GOAL) },
] as const;

function pad(value: string, width: number): string {
  return value.length >= width ? value : value + " ".repeat(width - value.length);
}

async function main() {
  console.log("x402 live price probe ($0 — unpaid 402 reads only)\n");
  console.log(
    `${pad("service", 12)} | ${pad("endpoint", 52)} | status | price (USDC) | settlement network`,
  );
  console.log("-".repeat(110));

  const failures: string[] = [];

  for (const target of PROBE_TARGETS) {
    try {
      const quote = await target.probe();
      const estimated = await target.estimate();
      if (Math.abs(quote.usdc - estimated) > 1e-9) {
        throw new Error(`EstimateCost mismatch: probe=${quote.usdc} estimate=${estimated}`);
      }
      console.log(
        `${pad(target.service, 12)} | ${pad(quote.endpoint, 52)} | ${pad("402", 6)} | ${quote.usdc.toFixed(6).padStart(12)} | ${quote.network}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(
        `${pad(target.service, 12)} | ${pad("(probe failed)", 52)} | FAIL   | ${"".padStart(12)} | ${message}`,
      );
      failures.push(`${target.service}: ${message}`);
    }
  }

  console.log("\n--- sample goal plan estimate ---\n");
  let planTotal = 0;
  let planOk = false;
  try {
    const plan = await createPlan(SAMPLE_GOAL);
    for (const step of plan.steps) {
      const note = step.service === "synthesize" ? " (local seller)" : "";
      console.log(`  ${step.service.padEnd(12)} $${step.estCostUsdc.toFixed(6)}  ${step.endpoint}${note}`);
      planTotal = plan.totalEstUsdc;
    }
    console.log(`  ${"TOTAL".padEnd(12)} $${planTotal.toFixed(6)}`);
    planOk = true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(`  plan estimate skipped: ${message}`);
    console.log("  (external probes above are still authoritative for live x402 pricing)");
  }

  if (planOk) {
    const fits = planTotal <= BUDGET_USDC;
    console.log(
      `\nBudget check: $${planTotal.toFixed(6)} ${fits ? "<=" : ">"} $${BUDGET_USDC.toFixed(2)} sample budget → ${fits ? "PASS" : "FAIL"}`,
    );
    if (!fits) failures.push(`plan total $${planTotal.toFixed(6)} exceeds $${BUDGET_USDC.toFixed(2)} budget`);
  }

  if (failures.length > 0) {
    console.error("\nProbe failures:");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
