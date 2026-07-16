#!/usr/bin/env node
/**
 * End-to-end testnet proof: UA 7702 top-up + Base Sepolia x402 payment + Arbitrum Sepolia /synthesize.
 * Prerequisites: dev-harness, Arbitrum Sepolia facilitator, and seller server must be running.
 */
import "dotenv/config";
import { runAgent } from "../src/agent/run.js";
import { CAIP2 } from "../src/config/chains.js";

process.env.NETWORK = "sepolia";

const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

function assertTxHash(label: string, hash: string): void {
  if (!TX_HASH_RE.test(hash)) {
    throw new Error(`${label}: expected real tx hash, got ${hash}`);
  }
}

async function assertServiceUp(url: string, name: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`${name} not reachable at ${url} (${res.status})`);
  }
}

async function main(): Promise<void> {
  console.log("=== x402 agent E2E (testnet) ===\n");

  await assertServiceUp("http://localhost:4030/health", "dev-harness");
  await assertServiceUp("http://localhost:4031/supported", "Arbitrum Sepolia facilitator");
  await assertServiceUp("http://localhost:4020/api/config", "seller/UI server");

  const goal = process.env.E2E_GOAL ?? "BTC price brief with cited web context";
  const budget = Number(process.env.E2E_BUDGET ?? "0.15");

  const result = await runAgent({
    goal,
    budgetUsdc: budget,
    onEvent: (event) => {
      if (event.type === "payment") {
        console.log(`[paid] ${event.line.service} $${event.line.usdc.toFixed(6)} ${event.line.explorerUrl}`);
      }
      if (event.type === "ua_topup") {
        console.log(`[ua] top-up $${event.amountUsdc} id=${event.transactionId}`);
      }
    },
  });

  console.log("\n--- ASSERTIONS ---");

  if (!result.uaTopUpTxId || result.uaTopUpTxId.length < 8) {
    throw new Error(
      `Expected real UA 7702 top-up transactionId (fund UA + keep EOA Base Sepolia below budget). Got: ${result.uaTopUpTxId ?? "missing"}`,
    );
  }
  console.log(`  ✓ UA 7702 top-up id: ${result.uaTopUpTxId}`);
  console.log(`    https://universalx.app/activity/details?id=${result.uaTopUpTxId}`);

  const basePayments = result.spend.filter((s) => s.network === CAIP2.baseSepolia);
  if (basePayments.length < 1) {
    throw new Error("Expected ≥1 Base Sepolia x402 payment against dev-harness");
  }
  for (const p of basePayments) {
    assertTxHash(`Base Sepolia ${p.service}`, p.txHash);
    console.log(`  ✓ ${p.service}: ${p.explorerUrl}`);
  }

  const synthesize = result.spend.find((s) => s.service === "synthesize");
  if (!synthesize || synthesize.network !== CAIP2.arbitrumSepolia) {
    throw new Error("Expected Arbitrum Sepolia /synthesize settlement");
  }
  assertTxHash("Arbitrum Sepolia synthesize", synthesize.txHash);
  console.log(`  ✓ synthesize: ${synthesize.explorerUrl}`);

  if (!result.deliverable || result.deliverable.length < 20) {
    throw new Error("Expected non-empty LLM deliverable");
  }
  console.log(`  ✓ Deliverable length: ${result.deliverable.length} chars`);
  console.log(`  ✓ Total spend: $${result.totalUsdc.toFixed(6)} USDC`);

  console.log("\n=== E2E PASSED ===");
}

main().catch((err) => {
  console.error("\n=== E2E FAILED ===\n", err);
  process.exit(1);
});
