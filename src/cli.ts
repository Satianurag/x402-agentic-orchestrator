#!/usr/bin/env node
import "dotenv/config";
import { runAgent } from "./agent/run.js";

function parseArgs(argv: string[]) {
  let goal = "";
  let budget = 0.5;
  let network = process.env.NETWORK ?? "mainnet";

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--goal" && argv[i + 1]) goal = argv[++i];
    else if (arg === "--budget" && argv[i + 1]) budget = parseFloat(argv[++i]);
    else if (arg === "--network" && argv[i + 1]) {
      network = argv[++i] === "sepolia" ? "sepolia" : "mainnet";
      process.env.NETWORK = network;
    }
  }
  return { goal, budget, network };
}

async function main() {
  const { goal, budget, network } = parseArgs(process.argv.slice(2));
  if (!goal) {
    console.error("Usage: tsx src/cli.ts --goal \"...\" --budget 0.50 --network mainnet");
    process.exit(1);
  }

  console.log(`[cli] network=${network} budget=${budget} USDC`);
  console.log(`[cli] goal: ${goal}`);

  const result = await runAgent({
    goal,
    budgetUsdc: budget,
    onEvent: (event) => {
      switch (event.type) {
        case "plan":
          console.log("\n--- PLAN ---");
          for (const step of event.plan.steps) {
            console.log(`  ${step.service}: ${step.endpoint} (~$${step.estCostUsdc.toFixed(4)})`);
          }
          console.log(`  Total est: $${event.plan.totalEstUsdc.toFixed(4)}\n`);
          break;
        case "ua_topup":
          console.log(`[ua] cross-chain top-up $${event.amountUsdc} → EOA id=${event.transactionId}`);
          break;
        case "payment":
          console.log(
            `[paid] ${event.line.service} $${event.line.usdc.toFixed(6)} tx=${event.line.txHash} remaining=$${event.remaining.toFixed(6)}`,
          );
          if (event.line.explorerUrl) console.log(`       ${event.line.explorerUrl}`);
          break;
        case "error":
          console.error(`[error] ${event.message}`);
          break;
      }
    },
  });

  console.log("\n--- DELIVERABLE ---\n");
  console.log(result.deliverable);
  console.log("\n--- SPEND REPORT ---");
  for (const line of result.spend) {
    console.log(`  ${line.service.padEnd(12)} $${line.usdc.toFixed(6)}  ${line.txHash}`);
  }
  console.log(`  TOTAL: $${result.totalUsdc.toFixed(6)} USDC`);
  if (result.uaTopUpTxId) console.log(`  UA top-up: ${result.uaTopUpTxId}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
