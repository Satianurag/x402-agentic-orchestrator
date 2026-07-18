export interface PlanApprovalResult {
  approved: boolean;
  budgetUsdc: number;
}

interface PendingApproval {
  resolve: (result: PlanApprovalResult) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const pendingApprovals = new Map<string, PendingApproval>();

export function waitForPlanApproval(
  runId: string,
  defaultBudgetUsdc: number,
  timeoutMs = 600_000,
): Promise<PlanApprovalResult> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingApprovals.delete(runId);
      reject(new Error("Plan approval timed out — no response within 10 minutes"));
    }, timeoutMs);
    pendingApprovals.set(runId, {
      resolve: (result) => {
        clearTimeout(timer);
        pendingApprovals.delete(runId);
        resolve(result);
      },
      reject: (err) => {
        clearTimeout(timer);
        pendingApprovals.delete(runId);
        reject(err);
      },
      timer,
    });
    void defaultBudgetUsdc;
  });
}

export function resolvePlanApproval(
  runId: string,
  approved: boolean,
  budgetUsdc: number,
): void {
  const entry = pendingApprovals.get(runId);
  if (!entry) throw new Error(`No run awaiting plan approval: ${runId}`);
  entry.resolve({ approved, budgetUsdc });
}

export function rejectPlanApproval(runId: string, reason: string): void {
  const entry = pendingApprovals.get(runId);
  if (!entry) throw new Error(`No run awaiting plan approval: ${runId}`);
  entry.reject(new Error(reason));
}

export function hasPendingApproval(runId: string): boolean {
  return pendingApprovals.has(runId);
}
