#!/usr/bin/env node
/**
 * E2E smoke: server health + LLM planner + goal validation ($0, no paid run).
 * Set E2E_PAID=1 to run full paid agent (requires funded wallet + mainnet/testnet).
 */
import "dotenv/config";
import { createRunEstimate } from "../src/agent/estimate.js";
import { validateGoal, GoalRejectedError } from "../src/agent/goal-validation.js";
import { runAgent } from "../src/agent/run.js";

process.env.NETWORK = process.env.NETWORK ?? "mainnet";
process.env.SELLER_BASE_URL = process.env.SELLER_BASE_URL ?? "http://localhost:4020";

async function assertServiceUp(url: string, name: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${name} not reachable at ${url} (${res.status})`);
}

async function main(): Promise<void> {
  console.log("=== x402 agent E2E smoke ($0 planner) ===\n");

  await assertServiceUp("http://localhost:4020/api/config", "seller/UI server");

  try {
    validateGoal("hi");
    throw new Error("Expected GoalRejectedError for commodity goal");
  } catch (err) {
    if (!(err instanceof GoalRejectedError)) throw err;
    console.log(`  ✓ Goal rejection: ${err.reason}`);
  }

  const goal = process.env.E2E_GOAL ?? "What is the current BTC price in USD with cited sources?";
  const estimate = await createRunEstimate(goal);
  const mcpSteps = estimate.plan.steps.filter((s) => s.kind === "mcp");
  if (mcpSteps.length < 1) throw new Error("Expected ≥1 MCP step in plan");
  if (!estimate.reasoning) throw new Error("Expected planner reasoning");
  console.log(`  ✓ Plan: ${mcpSteps.length} MCP step(s), total ~$${estimate.totalEstUsdc.toFixed(4)}`);
  console.log(`  ✓ Reasoning: ${estimate.reasoning.slice(0, 100)}…`);

  if (process.env.E2E_PAID === "1") {
    console.log("\n--- Paid run (E2E_PAID=1) ---\n");
    const budget = Number(process.env.E2E_BUDGET ?? "0.15");
    const result = await runAgent({
      goal,
      budgetUsdc: budget,
      approvedPlan: estimate.plan,
    });
    if (!result.deliverable || result.deliverable.length < 20) {
      throw new Error("Expected non-empty deliverable");
    }
    console.log(`  ✓ Deliverable: ${result.deliverable.length} chars`);
    console.log(`  ✓ Total spend: $${result.totalUsdc.toFixed(6)}`);
  } else {
    console.log("\n  (Skipping paid run — set E2E_PAID=1 for full execution)\n");
  }

  console.log("=== E2E PASSED ===");
}

main().catch((err) => {
  console.error("\n=== E2E FAILED ===\n", err);
  process.exit(1);
});
