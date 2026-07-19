#!/usr/bin/env node
/**
 * $0 integration test: Bazaar MCP discovery + LLM tool planner + live 402 probe.
 */
import "dotenv/config";
import { createPlan } from "../src/agent/plan.js";
import { createRunEstimate } from "../src/agent/estimate.js";
import { discoverToolCatalog, parseMcpCatalogTools } from "../src/agent/tool-catalog.js";
import { mcpSearchResources } from "../src/agent/bazaar-mcp.js";
import { searchBazaar } from "../src/agent/bazaar.js";
import { CDP_FACILITATOR_URL } from "@coinbase/cdp-sdk/x402";
import { validateGoal, GoalRejectedError } from "../src/agent/goal-validation.js";

process.env.NETWORK = process.env.NETWORK ?? "mainnet";
process.env.SELLER_BASE_URL = process.env.SELLER_BASE_URL ?? "http://localhost:4020";

const TEST_GOALS = [
  "What is the current BTC and ETH price in USD?",
  "Investigate how AI agents use x402 for autonomous payments with primary sources",
];

async function main() {
  console.log("=== LLM Tool Planner + Bazaar MCP Integration Test ($0) ===\n");
  console.log(`Network: ${process.env.NETWORK}`);
  console.log(`Bazaar (CDP): ${CDP_FACILITATOR_URL}/discovery/search\n`);

  const failures: string[] = [];

  console.log("--- Goal validation ---\n");
  try {
    validateGoal("hi");
    failures.push("goal-validation: expected rejection for 'hi'");
  } catch (err) {
    const ok = err instanceof GoalRejectedError;
    console.log(`[${ok ? "PASS" : "FAIL"}] Rejects commodity goal "hi"`);
    if (!ok) failures.push("goal-validation: wrong error type");
  }
  console.log();

  console.log("--- Bazaar MCP search_resources ---\n");
  try {
    const mcpResult = await mcpSearchResources("web search");
    const tools = parseMcpCatalogTools(mcpResult);
    const ok = tools.length > 0;
    console.log(`[${ok ? "PASS" : "FAIL"}] MCP search_resources (${tools.length} tools)`);
    if (!ok) failures.push("mcp: empty catalog");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[FAIL] MCP: ${msg}`);
    failures.push(`mcp: ${msg}`);
  }
  console.log();

  console.log("--- HTTP Bazaar search ---\n");
  try {
    const resources = await searchBazaar("web search", 3);
    const ok = resources.length > 0;
    console.log(`[${ok ? "PASS" : "FAIL"}] HTTP bazaar.search (${resources.length} resources)`);
    if (!ok) failures.push("bazaar: empty search");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    failures.push(`bazaar: ${msg}`);
  }
  console.log();

  console.log("--- LLM planner (createPlan) ---\n");
  for (const goal of TEST_GOALS) {
    console.log(`Goal: "${goal.slice(0, 65)}…"`);
    try {
      const plan = await createPlan(goal);
      const mcpSteps = plan.steps.filter((s) => s.kind === "mcp");
      console.log(`  Needs: ${plan.needs.join(", ")}`);
      console.log(`  Reasoning: ${plan.reasoning.slice(0, 120)}…`);
      if (plan.thoughts) console.log(`  Thoughts: ${plan.thoughts.slice(0, 80)}…`);
      for (const step of plan.steps) {
        const tag = step.kind === "mcp" ? "[mcp]" : "[local]";
        console.log(`    ${step.label.padEnd(28)} $${step.estCostUsdc.toFixed(6)} ${tag}`);
      }
      console.log(`    TOTAL $${plan.totalEstUsdc.toFixed(6)}`);
      if (mcpSteps.length === 0) failures.push(`plan: no MCP steps for "${goal.slice(0, 30)}…"`);
      if (!plan.reasoning) failures.push(`plan: missing reasoning for "${goal.slice(0, 30)}…"`);
      for (const step of mcpSteps) {
        if (!step.mcpToolName) failures.push(`plan: MCP step missing tool name`);
        if (!step.proxyParameters) failures.push(`plan: MCP step missing proxyParameters`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`    PLAN FAILED: ${msg}`);
      failures.push(`plan: ${msg}`);
    }
    console.log();
  }

  console.log("--- User tool pick validation ---\n");
  try {
    const estimate = await createRunEstimate("What is BTC price in USD?", {
      userToolPicks: ["tavily", "browserbase"],
    });
    const hasWarning = estimate.warnings.length > 0;
    console.log(`[${hasWarning ? "PASS" : "WARN"}] wrong picks produced ${estimate.warnings.length} warning(s)`);
    for (const w of estimate.warnings) {
      console.log(`  ⚠ ${w.issue}: ${w.reason.slice(0, 100)}`);
    }
    const catalog = await discoverToolCatalog("crypto price bitcoin");
    const cheapest = [...catalog].filter((t) => t.catalogUsdc != null).sort((a, b) => a.catalogUsdc! - b.catalogUsdc!)[0];
    if (cheapest && estimate.plan.totalEstUsdc > (cheapest.catalogUsdc ?? 1) * 3) {
      console.log(`  Note: plan $${estimate.plan.totalEstUsdc} vs cheapest catalog $${cheapest.catalogUsdc}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    failures.push(`user-picks: ${msg}`);
  }

  if (failures.length > 0) {
    console.error("\nFAILED:");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  console.log("\n✓ All LLM planner + Bazaar checks passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
