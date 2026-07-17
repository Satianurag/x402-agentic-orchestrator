import { fundRunWallet, type BudgetGuard } from "../budget/guard.js";
import { validateGoal } from "./goal-validation.js";
import { waitForPlanApproval } from "./run-controller.js";
import { createPlan, type AgentPlan, type PlanStep } from "./plan.js";
import { synthesizeDeliverable } from "../services/seller.js";
import { createBazaarMcpSession, mcpProxyToolCall, type BazaarMcpSession } from "./bazaar-mcp.js";
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
}

export interface RunResult {
  deliverable: string;
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
  | { type: "payment"; line: SpendLine; remaining: number }
  | { type: "step_done"; step: PlanStep; index: number }
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
  mcpSession: BazaarMcpSession | undefined,
): Promise<PaymentResult> {
  if (step.kind === "synthesize") {
    return synthesizeDeliverable(goal, context, guard);
  }

  if (!step.mcpToolName) {
    throw new Error(`MCP step "${step.label}" is missing mcpToolName`);
  }
  if (!mcpSession) {
    throw new Error("MCP session required for Bazaar tool execution");
  }

  return mcpProxyToolCall(
    mcpSession,
    step.mcpToolName,
    step.proxyParameters ?? {},
    step.label,
  );
}

async function runAgentInner(options: RunOptions): Promise<RunResult> {
  const { goal, onEvent, signal, requirePlanApproval = false, runId, userToolPicks, approvedPlan } =
    options;
  let budgetUsdc = options.budgetUsdc;
  abortController = new AbortController();
  const mergedSignal = signal ?? abortController.signal;

  validateGoal(goal);
  const plan = approvedPlan ?? (await createPlan(goal, { userToolPicks }));
  onEvent?.({ type: "plan", plan });

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

  const guard = await fundRunWallet(budgetUsdc);
  const uaTopUp = guard.uaTopUp;
  if (uaTopUp) {
    onEvent?.({ type: "ua_topup", transactionId: uaTopUp.transactionId, amountUsdc: uaTopUp.amountUsdc });
  }

  const spend: SpendLine[] = [];
  const context: unknown[] = [];
  let deliverable = "";
  const hasMcpSteps = plan.steps.some((s) => s.kind === "mcp");
  const mcpSession = hasMcpSteps ? await createBazaarMcpSession(guard) : undefined;

  try {
    for (let i = 0; i < plan.steps.length; i++) {
      if (mergedSignal.aborted) throw new Error("Run aborted");

      const step = plan.steps[i];
      onEvent?.({ type: "step_start", step, index: i });

      const result = await executeStep(step, goal, guard, context, mcpSession);
      context.push({ tool: step.label, mcpToolName: step.mcpToolName, data: result.data });

      const line: SpendLine = {
        service: step.label,
        usdc: result.usdc,
        txHash: result.txHash,
        explorerUrl: result.explorerUrl,
        network: result.network,
      };
      spend.push(line);
      onEvent?.({ type: "payment", line, remaining: await guard.getRemaining() });
      onEvent?.({ type: "step_done", step, index: i });

      if (step.kind === "synthesize") {
        const payload = result.data as { deliverable?: string };
        if (!payload.deliverable) {
          throw new Error("Synthesize step returned no deliverable");
        }
        deliverable = payload.deliverable;
      }
    }
  } finally {
    await mcpSession?.close();
  }

  const totalUsdc = spend.reduce((s, l) => s + l.usdc, 0);
  const runResult: RunResult = {
    deliverable,
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
