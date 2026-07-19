#!/usr/bin/env node
import {
  clampRunBudget,
  comfortableRunBudget,
  evaluateRunBudget,
  minimumRunBudget,
  recommendedRunBudget,
} from "../public/js/budget.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(recommendedRunBudget(0.04) === 0.05, "recommended buffer");
assert(minimumRunBudget(0.051) === 0.06, "minimum rounds up");
assert(comfortableRunBudget(0.1) === 0.16, "comfortable 50% buffer");
assert(clampRunBudget(99) === 5, "max cap");

const low = evaluateRunBudget({ runLimit: 0.03, estimatedCost: 0.05, walletCredit: 1 });
assert(!low.canRun && low.state === "error", "blocks under estimate");

const ok = evaluateRunBudget({ runLimit: 0.15, estimatedCost: 0.05, walletCredit: 1 });
assert(ok.canRun && ok.state === "ok", "allows healthy limit");

const wallet = evaluateRunBudget({ runLimit: 2, estimatedCost: 0.05, walletCredit: 0.5 });
assert(wallet.canRun && wallet.state === "warn", "warns on wallet");

console.log("=== budget.js tests passed ===");
