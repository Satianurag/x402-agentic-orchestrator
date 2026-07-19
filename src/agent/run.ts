import { fundRunWallet } from "../budget/guard.js";
import { validateGoal } from "./goal-validation.js";
import { waitForPlanApproval } from "./run-controller.js";
import { createPlan, type AgentPlan, type PlanStep } from "./plan.js";
import { composeDeliverable } from "./compose-deliverable.js";
import type { ReportDocument } from "./report-document.js";
import { createBazaarMcpSession, type BazaarMcpSession } from "./bazaar-mcp.js";
import { executePaidToolStep } from "./tool-execution.js";
import { findCatalogTool } from "./tool-catalog.js";
import { planHasBlockingProbeFailures } from "./tool-probe.js";
import { resolveRunSession } from "../wallet/session.js";
import { runWithContext } from "../wallet/run-context.js";
import { setSignRequestEmitter } from "../wallet/sign-bridge.js";
import type { SignRequest } from "../wallet/sign-bridge.js";
import type { PaymentResult } from "../services/x402-client.js";

export interface SpendLine {
  service: string;
  usdc: number;
  txHash: string;
  explorerUrl: string;
  network: string;
  /** Platform LLM / free step — not billed via x402. */
  included?: boolean;
}

/** Resume a run after partial completion — skip already-paid steps. */
export interface RunCheckpoint {
  goal: string;
  plan: AgentPlan;
  budgetUsdc: number;
  nextStepIndex: number;
  spend: SpendLine[];
  toolContext: unknown[];
}

export function canResumeCheckpoint(cp: RunCheckpoint | null | undefined): boolean {
  if (!cp) return false;
  return cp.nextStepIndex > 0 && cp.nextStepIndex < cp.plan.steps.length;
}

export interface RunResult {
  /** Markdown export — derived deterministically from `document`. */
  deliverable: string;
  /** Structured report — source of truth for UI rendering. */
  document: ReportDocument;
  /** Paid x402 lines + included compose (usdc 0). totalUsdc sums paid only. */
  spend: SpendLine[];
  totalUsdc: number;
  plan: AgentPlan;
  goal: string;
  toolContext: unknown[];
  uaTopUpTxId?: string;
}

export type RunEvent =
  | { type: "plan"; plan: AgentPlan }
  | { type: "plan_approval_required"; runId: string; plan: AgentPlan; budgetUsdc: number }
  | { type: "ua_topup"; transactionId: string; amountUsdc: number }
  | { type: "step_start"; step: PlanStep; index: number }
  | { type: "step_retry"; step: PlanStep; index: number; attempt: number; reason: string }
  | { type: "payment"; line: SpendLine; remaining: number }
  | { type: "step_done"; step: PlanStep; index: number }
  | { type: "checkpoint"; checkpoint: RunCheckpoint }
  | { type: "sign_request"; request: SignRequest }
  | { type: "error"; message: string }
  | { type: "done"; result: RunResult };

export interface RunOptions {
  goal: string;
  budgetUsdc: number;
  didToken?: string;
  requireMagic?: boolean;
  requirePlanApproval?: boolean;
  runId?: string;
  userToolPicks?: string[];
  approvedPlan?: AgentPlan;
  resumeFrom?: RunCheckpoint;
  onEvent?: (event: RunEvent) => void;
  signal?: AbortSignal;
}

let abortController: AbortController | null = null;

export function abortRun(): void {
  abortController?.abort();
}

async function executeStep(
  step: PlanStep,
  mcpSession: BazaarMcpSession | undefined,
  guard: import("../budget/guard.js").BudgetGuard,
  catalog: import("./tool-catalog.js").CatalogTool[],
  onRetry?: (info: { attempt: number; reason: string; label: string }) => void,
): Promise<PaymentResult> {
  const tool = step.mcpToolName ? findCatalogTool(catalog, step.mcpToolName) : undefined;
  return executePaidToolStep(step, tool, mcpSession, guard, { onRetry });
}

async function runAgentInner(options: RunOptions): Promise<RunResult> {
  const {
    goal,
    onEvent,
    signal,
    requirePlanApproval = false,
    runId,
    userToolPicks,
    approvedPlan,
    resumeFrom,
  } = options;
  let budgetUsdc = resumeFrom?.budgetUsdc ?? options.budgetUsdc;
  abortController = new AbortController();
  const mergedSignal = signal ?? abortController.signal;

  validateGoal(goal);
  const plan = resumeFrom?.plan ?? approvedPlan ?? (await createPlan(goal, { userToolPicks }));
  onEvent?.({ type: "plan", plan });

  if (!resumeFrom && planHasBlockingProbeFailures(plan.steps)) {
    throw new Error(
      "One or more tools failed preflight (vendor down or bad endpoint). Re-check price before running.",
    );
  }

  if (plan.totalEstUsdc > budgetUsdc) {
    throw new Error(
      `Plan estimate $${plan.totalEstUsdc.toFixed(4)} exceeds budget $${budgetUsdc.toFixed(4)} USDC`,
    );
  }

  if (requirePlanApproval && runId) {
    onEvent?.({ type: "plan_approval_required", runId, plan, budgetUsdc });
    const approval = await waitForPlanApproval(runId, budgetUsdc);
    if (!approval.approved) throw new Error("Run cancelled — plan not approved");
    budgetUsdc = approval.budgetUsdc;
    if (plan.totalEstUsdc > budgetUsdc) {
      throw new Error(
        `Plan estimate $${plan.totalEstUsdc.toFixed(4)} exceeds approved budget $${budgetUsdc.toFixed(4)} USDC`,
      );
    }
  }

  // Fund only for paid x402 tools (compose is free).
  const guard = await fundRunWallet(budgetUsdc);
  if (resumeFrom) {
    const priorSpend = resumeFrom.spend
      .filter((l) => !l.included)
      .reduce((s, l) => s + l.usdc, 0);
    guard.seedSpent(priorSpend);
    console.log(
      `[run] Resuming from step ${resumeFrom.nextStepIndex + 1}/${plan.steps.length} ` +
        `($${priorSpend.toFixed(4)} already spent)`,
    );
  }
  const uaTopUp = guard.uaTopUp;
  if (uaTopUp) {
    onEvent?.({ type: "ua_topup", transactionId: uaTopUp.transactionId, amountUsdc: uaTopUp.amountUsdc });
  }

  const spend: SpendLine[] = resumeFrom ? [...resumeFrom.spend] : [];
  const context: unknown[] = resumeFrom ? [...resumeFrom.toolContext] : [];
  let deliverable = "";
  let document: ReportDocument | null = null;
  const startIndex = resumeFrom?.nextStepIndex ?? 0;
  const mcpSteps = plan.steps.filter((s) => s.kind === "mcp");
  const allowedToolNames = new Set(
    mcpSteps.map((s) => s.mcpToolName).filter((n): n is string => Boolean(n)),
  );
  const mcpSession =
    mcpSteps.length > 0
      ? await createBazaarMcpSession(guard, { allowedToolNames })
      : undefined;

  try {
    for (let i = startIndex; i < plan.steps.length; i++) {
      if (mergedSignal.aborted) throw new Error("Run aborted");

      const step = plan.steps[i];
      onEvent?.({ type: "step_start", step, index: i });

      if (step.kind === "compose") {
        const paidSoFar = spend.filter((l) => !l.included).reduce((s, l) => s + l.usdc, 0);
        const composed = composeDeliverable({
          goal,
          toolContext: context,
          spend,
          totalUsdc: paidSoFar,
        });
        document = composed.document;
        deliverable = composed.deliverable;

        const line: SpendLine = {
          service: step.label,
          usdc: 0,
          txHash: "",
          explorerUrl: "",
          network: "local",
          included: true,
        };
        spend.push(line);
        onEvent?.({
          type: "payment",
          line,
          remaining: await guard.getRemaining(),
        });
        onEvent?.({ type: "step_done", step, index: i });
        onEvent?.({
          type: "checkpoint",
          checkpoint: {
            goal,
            plan,
            budgetUsdc,
            nextStepIndex: i + 1,
            spend: [...spend],
            toolContext: [...context],
          },
        });
        continue;
      }

      const result = await executeStep(step, mcpSession, guard, plan.catalog, (info) => {
        onEvent?.({
          type: "step_retry",
          step,
          index: i,
          attempt: info.attempt,
          reason: info.reason,
        });
      });

      context.push({ tool: step.label, mcpToolName: step.mcpToolName, data: result.data });

      const included = result.usdc === 0 && !result.txHash;
      const line: SpendLine = {
        service: step.label,
        usdc: result.usdc,
        txHash: result.txHash,
        explorerUrl: result.explorerUrl,
        network: result.network,
        included,
      };
      spend.push(line);
      onEvent?.({
        type: "payment",
        line,
        remaining: await guard.getRemaining(),
      });
      onEvent?.({ type: "step_done", step, index: i });
      onEvent?.({
        type: "checkpoint",
        checkpoint: {
          goal,
          plan,
          budgetUsdc,
          nextStepIndex: i + 1,
          spend: [...spend],
          toolContext: [...context],
        },
      });
    }
  } finally {
    await mcpSession?.close();
  }

  const totalUsdc = spend.filter((l) => !l.included).reduce((s, l) => s + l.usdc, 0);

  if (!document) {
    const composed = composeDeliverable({
      goal,
      toolContext: context,
      spend,
      totalUsdc,
    });
    document = composed.document;
    deliverable = composed.deliverable;
  }

  const runResult: RunResult = {
    deliverable,
    document,
    spend,
    totalUsdc,
    plan,
    goal,
    toolContext: context,
    uaTopUpTxId: uaTopUp?.transactionId,
  };
  onEvent?.({ type: "done", result: runResult });
  return runResult;
}

export async function runAgent(options: RunOptions): Promise<RunResult> {
  const { didToken, requireMagic = false, onEvent } = options;
  const session = await resolveRunSession(didToken, requireMagic);

  if (session.signer.mode === "ui") {
    setSignRequestEmitter((req) => onEvent?.({ type: "sign_request", request: req }));
  }

  try {
    return await runWithContext(
      { eoaAddress: session.eoaAddress, signer: session.signer, magicVerified: session.magicVerified },
      () => runAgentInner(options),
    );
  } finally {
    setSignRequestEmitter(null);
  }
}
