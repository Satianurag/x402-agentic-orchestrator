#!/usr/bin/env node
import "dotenv/config";
import { runAgent } from "./agent/run.js";
import { createRunEstimate } from "./agent/estimate.js";
import { validateGoal, GoalRejectedError } from "./agent/goal-validation.js";

function parseArgs(argv: string[]) {
  let goal = "";
  let budget = 0.5;
  let network = process.env.NETWORK ?? "mainnet";
  const toolPicks: string[] = [];

  let estimateOnly = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--estimate-only") estimateOnly = true;
    else if (arg === "--goal" && argv[i + 1]) goal = argv[++i];
    else if (arg === "--budget" && argv[i + 1]) budget = parseFloat(argv[++i]);
    else if (arg === "--tool" && argv[i + 1]) toolPicks.push(argv[++i]);
    else if (arg === "--network" && argv[i + 1]) {
      network = argv[++i] === "sepolia" ? "sepolia" : "mainnet";
      process.env.NETWORK = network;
    }
  }
  return { goal, budget, network, toolPicks, estimateOnly };
}

function printPlan(event: { plan: import("./agent/plan.js").AgentPlan }) {
  const { plan } = event;
  console.log("\n--- PLAN ---");
  if (plan.needs?.length) console.log(`Needs: ${plan.needs.join(", ")}`);
  if (plan.reasoning) console.log(`Reasoning: ${plan.reasoning}`);
  if (plan.thoughts) {
    console.log("\n[thinking]");
    console.log(plan.thoughts);
  }
  if (plan.warnings?.length) {
    console.log("\nWarnings:");
    for (const w of plan.warnings) {
      console.log(`  ⚠ ${w.issue}: ${w.reason}`);
      if (w.alternatives.length) console.log(`    Alternatives: ${w.alternatives.join(", ")}`);
    }
  }
  console.log();
  for (const step of plan.steps) {
    const label = step.label ?? step.service;
    console.log(`  • ${label}  ~$${step.estCostUsdc.toFixed(4)}`);
    if (step.why) console.log(`    Why: ${step.why}`);
    if (step.mcpToolName) console.log(`    MCP: ${step.mcpToolName}`);
  }
  console.log(`\n  Total est: $${plan.totalEstUsdc.toFixed(4)}\n`);
}

async function main() {
  const { goal, budget, network, toolPicks, estimateOnly } = parseArgs(process.argv.slice(2));
  if (!goal) {
    console.error(
      'Usage: npm run cli -- --goal "..." [--estimate-only] [--budget 0.50] [--tool name]',
    );
    process.exit(1);
  }

  console.log(`[cli] network=${network} budget=${budget} USDC`);
  console.log(`[cli] goal: ${goal}`);
  if (toolPicks.length) console.log(`[cli] preferred tools: ${toolPicks.join(", ")}`);

  try {
    validateGoal(goal);
  } catch (err) {
    if (err instanceof GoalRejectedError) {
      console.error(`\nGoal rejected: ${err.message}`);
      if (err.suggestion) console.error(`Suggestion: ${err.suggestion}`);
      process.exit(1);
    }
    throw err;
  }

  const estimate = await createRunEstimate(goal, { userToolPicks: toolPicks });
  printPlan({ plan: estimate.plan });

  if (estimateOnly) {
    console.log("[cli] --estimate-only: skipping paid run");
    return;
  }

  const result = await runAgent({
    goal,
    budgetUsdc: budget,
    userToolPicks: toolPicks,
    approvedPlan: estimate.plan,
    onEvent: (event) => {
      switch (event.type) {
        case "plan":
          printPlan(event);
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
  console.log("\n--- SPEND SUMMARY ---");
  for (const line of result.spend) {
    console.log(`  ${line.service.padEnd(28)} $${line.usdc.toFixed(6)}  ${line.txHash}`);
    if (line.explorerUrl) console.log(`               ${line.explorerUrl}`);
  }
  console.log(`  TOTAL: $${result.totalUsdc.toFixed(6)} USDC`);
  if (result.uaTopUpTxId) console.log(`  UA top-up: ${result.uaTopUpTxId}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
