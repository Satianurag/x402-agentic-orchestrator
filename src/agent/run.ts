import { fundRunWallet, type BudgetGuard } from "../budget/guard.js";
import { assertExternalServicesAvailable } from "../config/chains.js";
import { createPlan, type AgentPlan, type PlanStep } from "./plan.js";
import { tavilySearch } from "../services/tavily.js";
import { coingeckoPrice } from "../services/coingecko.js";
import { firecrawlSearch } from "../services/firecrawl.js";
import { browserbaseCreateSession } from "../services/browserbase.js";
import { exaSearch } from "../services/exa.js";
import { synthesizeDeliverable } from "../services/seller.js";
import { resolveRunSession } from "../wallet/session.js";
import type { PaymentResult } from "../services/x402-client.js";

export interface SpendLine {
  service: string;
  usdc: number;
  txHash: string;
  explorerUrl: string;
}

export interface RunResult {
  deliverable: string;
  spend: SpendLine[];
  totalUsdc: number;
  plan: AgentPlan;
  uaTopUpTxId?: string;
}

export type RunEvent =
  | { type: "plan"; plan: AgentPlan }
  | { type: "ua_topup"; transactionId: string; amountUsdc: number }
  | { type: "step_start"; step: PlanStep; index: number }
  | { type: "payment"; line: SpendLine; remaining: number }
  | { type: "step_done"; step: PlanStep; index: number }
  | { type: "error"; message: string }
  | { type: "done"; result: RunResult };

export interface RunOptions {
  goal: string;
  budgetUsdc: number;
  didToken?: string;
  requireMagic?: boolean;
  onEvent?: (event: RunEvent) => void;
  signal?: AbortSignal;
}

let abortController: AbortController | null = null;

export function abortRun(): void {
  abortController?.abort();
}

async function executeStep(
  step: PlanStep,
  goal: string,
  guard: BudgetGuard,
  context: unknown[],
): Promise<PaymentResult> {
  switch (step.service) {
    case "tavily":
      return tavilySearch((step.params?.query as string) ?? goal, guard);
    case "coingecko": {
      const ids = (step.params?.ids as string[]) ?? ["bitcoin", "ethereum"];
      const vs = (step.params?.vs as string[]) ?? ["usd"];
      return coingeckoPrice(ids, vs, guard);
    }
    case "firecrawl":
      return firecrawlSearch((step.params?.query as string) ?? goal, guard);
    case "browserbase":
      return browserbaseCreateSession(guard);
    case "exa":
      return exaSearch((step.params?.query as string) ?? goal, guard);
    case "synthesize":
      return synthesizeDeliverable(goal, context, guard);
  }
}

export async function runAgent(options: RunOptions): Promise<RunResult> {
  const { goal, budgetUsdc, didToken, requireMagic = false, onEvent, signal } = options;
  abortController = new AbortController();
  const mergedSignal = signal ?? abortController.signal;

  if (requireMagic && !didToken) {
    throw new Error("Magic login required — provide didToken from the UI");
  }

  await resolveRunSession(didToken);
  assertExternalServicesAvailable();

  const plan = await createPlan(goal);
  onEvent?.({ type: "plan", plan });

  if (plan.totalEstUsdc > budgetUsdc) {
    throw new Error(
      `Plan estimate $${plan.totalEstUsdc.toFixed(4)} exceeds budget $${budgetUsdc.toFixed(4)} USDC`,
    );
  }

  const guard = await fundRunWallet(budgetUsdc);
  const uaTopUp = guard.uaTopUp;
  if (uaTopUp) {
    onEvent?.({ type: "ua_topup", transactionId: uaTopUp.transactionId, amountUsdc: uaTopUp.amountUsdc });
  }

  const spend: SpendLine[] = [];
  const context: unknown[] = [];
  let deliverable = "";

  for (let i = 0; i < plan.steps.length; i++) {
    if (mergedSignal.aborted) throw new Error("Run aborted");

    const step = plan.steps[i];
    onEvent?.({ type: "step_start", step, index: i });

    const result = await executeStep(step, goal, guard, context);
    context.push({ service: step.service, data: result.data });

    const line: SpendLine = {
      service: step.service,
      usdc: result.usdc,
      txHash: result.txHash,
      explorerUrl: result.explorerUrl,
    };
    spend.push(line);
    onEvent?.({ type: "payment", line, remaining: await guard.getRemaining() });
    onEvent?.({ type: "step_done", step, index: i });

    if (step.service === "synthesize") {
      const payload = result.data as { deliverable?: string };
      if (!payload.deliverable) {
        throw new Error("Synthesize step returned no deliverable");
      }
      deliverable = payload.deliverable;
    }
  }

  const totalUsdc = spend.reduce((s, l) => s + l.usdc, 0);
  const runResult: RunResult = {
    deliverable,
    spend,
    totalUsdc,
    plan,
    uaTopUpTxId: uaTopUp?.transactionId,
  };
  onEvent?.({ type: "done", result: runResult });
  return runResult;
}
