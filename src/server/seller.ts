import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import {
  createSellerFacilitatorClient,
  getBaseRpcUrl,
  getNetworkMode,
  getPaymentCaip2,
  getPaymentChain,
} from "../config/chains.js";
import { PREBUILT_AGENTS } from "../agent/prebuilt.js";
import { synthesizeWithLlm } from "../agent/synthesize-llm.js";
import { runAgent, abortRun, type RunEvent, type RunResult } from "../agent/run.js";
import { resolvePlanApproval, hasPendingApproval } from "../agent/run-controller.js";
import { createRunEstimate, GoalRejectedError } from "../agent/estimate.js";
import { answerFollowUp } from "../agent/follow-up-chat.js";
import type { AgentPlan } from "../agent/plan.js";
import { fulfillSignRequest, jsonSafeDeep } from "../wallet/sign-bridge.js";
import { SELLER_PRICE_USDC } from "../services/seller.js";
import { verifyMagicDidToken } from "../wallet/ua.js";
import { resolveRunSession } from "../wallet/session.js";
import { getWalletBalances } from "../wallet/balance.js";
import { getServicesHealth } from "../server/health.js";
import {
  listRuns,
  getRun,
  saveRun,
  deleteRun,
  listCustomAgents,
  saveCustomAgent,
  deleteCustomAgent,
  getAnalytics,
  getLedger,
  type RunRecord,
  type CustomAgent,
} from "../store/json-store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "../../public");
const PORT = Number(process.env.PORT ?? 4020);

const payTo = process.env.SELLER_PAY_TO;
if (!payTo) {
  throw new Error("SELLER_PAY_TO is required — wallet that receives USDC on /synthesize");
}

const magicPublishableKey = process.env.MAGIC_PUBLISHABLE_KEY;
if (!magicPublishableKey) {
  throw new Error("MAGIC_PUBLISHABLE_KEY is required for UI login");
}

// Buyer tools + /synthesize both settle in USDC on Base so UA Base deposits fund the full run.
const network = getPaymentCaip2();
const facilitatorClient = createSellerFacilitatorClient();
const resourceServer = new x402ResourceServer(facilitatorClient).register(
  network,
  new ExactEvmScheme(),
);

const app = express();
app.use(express.json());

async function requireMagicAddress(didToken: string | undefined): Promise<`0x${string}`> {
  if (!didToken) throw new Error("Magic login required — didToken missing");
  return (await verifyMagicDidToken(didToken)) as `0x${string}`;
}

function sanitizeErrorMessage(message: string): string {
  let m = message;
  if (/<html[\s>]/i.test(m) || m.includes("Streamable HTTP error")) {
    m = m.replace(/<html[\s\S]*/i, "[Coinbase/HTML error page truncated]");
  }
  if (m.length > 500) m = `${m.slice(0, 500)}…`;
  return m;
}

function persistCompletedRun(
  address: `0x${string}`,
  runId: string,
  goal: string,
  budgetUsdc: number,
  result: RunResult | null,
  status: RunRecord["status"],
  errorMessage?: string,
): void {
  const safeError = errorMessage ? sanitizeErrorMessage(errorMessage) : undefined;
  saveRun(address, {
    id: runId,
    goal,
    createdAt: new Date().toISOString(),
    status,
    totalUsdc: result?.totalUsdc ?? 0,
    deliverable: result?.deliverable ?? (safeError ? `Error: ${safeError}` : ""),
    spend: result?.spend ?? [],
    uaTopUpTxId: result?.uaTopUpTxId,
    budgetUsdc,
  });
}

app.use(
  paymentMiddleware(
    {
      "POST /synthesize": {
        accepts: [
          {
            scheme: "exact",
            price: `$${SELLER_PRICE_USDC}`,
            network,
            payTo,
          },
        ],
        description: "Synthesize a final deliverable from collected agent context (Base USDC)",
        mimeType: "application/json",
      },
    },
    resourceServer,
  ),
);

app.get("/api/config", (_req, res) => {
  const paymentChain = getPaymentChain();
  res.json({
    magicPublishableKey,
    network: getNetworkMode(),
    sellerNetwork: network,
    magicNetwork: {
      rpcUrl: getBaseRpcUrl(),
      chainId: paymentChain.id,
    },
  });
});

app.post("/synthesize", async (req, res) => {
  try {
    const { goal, context } = req.body as { goal?: string; context?: unknown[] };
    if (!goal) {
      res.status(400).json({ error: "goal is required" });
      return;
    }
    const deliverable = await synthesizeWithLlm(goal, context ?? []);
    res.json({ deliverable, goal, stepCount: (context ?? []).length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.get("/agents", (_req, res) => {
  res.json(PREBUILT_AGENTS);
});

app.get("/api/health", async (_req, res) => {
  res.json({ services: await getServicesHealth(), network: getNetworkMode() });
});

/** Render health check — lightweight 200 (docs: healthCheckPath). */
app.get("/health", (_req, res) => {
  res.status(200).type("text/plain").send("ok");
});

app.post("/api/estimate", async (req, res) => {
  try {
    const { goal, userToolPicks } = req.body as { goal?: string; userToolPicks?: string[] };
    if (!goal || typeof goal !== "string") {
      res.status(400).json({ error: "goal is required" });
      return;
    }
    const picks = Array.isArray(userToolPicks)
      ? userToolPicks.filter((p): p is string => typeof p === "string" && p.trim().length > 0)
      : undefined;
    const estimate = await createRunEstimate(goal, { userToolPicks: picks });
    res.json(estimate);
  } catch (err) {
    if (err instanceof GoalRejectedError) {
      res.status(400).json({
        error: err.message,
        reason: err.reason,
        suggestion: err.suggestion,
      });
      return;
    }
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/api/follow-up", async (req, res) => {
  try {
    const { question, goal, deliverable, toolContext, spend } = req.body as {
      question?: string;
      goal?: string;
      deliverable?: string;
      toolContext?: unknown[];
      spend?: Array<{ service: string; usdc: number }>;
    };
    if (!question?.trim() || !goal?.trim() || !deliverable?.trim()) {
      res.status(400).json({ error: "question, goal, and deliverable are required" });
      return;
    }
    const spendSummary = spend?.map((s) => `${s.service}: $${s.usdc.toFixed(6)}`).join("\n");
    const result = await answerFollowUp({
      question: question.trim(),
      goal: goal.trim(),
      deliverable: deliverable.trim(),
      toolContext,
      spendSummary,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/api/balance", async (req, res) => {
  try {
    const { didToken } = req.body as { didToken?: string };
    const session = await resolveRunSession(didToken, true);
    const balances = await getWalletBalances(session.eoaAddress, session.signer);
    res.json(balances);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.get("/api/history", async (req, res) => {
  try {
    const didToken = req.headers.authorization?.replace(/^Bearer\s+/i, "") ?? (req.query.didToken as string);
    const address = await requireMagicAddress(didToken);
    res.json(listRuns(address));
  } catch (err) {
    res.status(401).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.get("/api/history/:id", async (req, res) => {
  try {
    const didToken = req.headers.authorization?.replace(/^Bearer\s+/i, "") ?? (req.query.didToken as string);
    const address = await requireMagicAddress(didToken);
    const run = getRun(address, req.params.id);
    if (!run) {
      res.status(404).json({ error: "Run not found" });
      return;
    }
    res.json(run);
  } catch (err) {
    res.status(401).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.delete("/api/history/:id", async (req, res) => {
  try {
    const { didToken } = req.body as { didToken?: string };
    const address = await requireMagicAddress(didToken);
    const ok = deleteRun(address, req.params.id);
    if (!ok) {
      res.status(404).json({ error: "Run not found" });
      return;
    }
    res.json({ deleted: true });
  } catch (err) {
    res.status(401).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.get("/api/analytics", async (req, res) => {
  try {
    const didToken = req.headers.authorization?.replace(/^Bearer\s+/i, "") ?? (req.query.didToken as string);
    const address = await requireMagicAddress(didToken);
    res.json(getAnalytics(address));
  } catch (err) {
    res.status(401).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.get("/api/ledger", async (req, res) => {
  try {
    const didToken = req.headers.authorization?.replace(/^Bearer\s+/i, "") ?? (req.query.didToken as string);
    const address = await requireMagicAddress(didToken);
    res.json(getLedger(address));
  } catch (err) {
    res.status(401).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.get("/api/ledger/export.csv", async (req, res) => {
  try {
    const didToken = req.headers.authorization?.replace(/^Bearer\s+/i, "") ?? (req.query.didToken as string);
    const address = await requireMagicAddress(didToken);
    const lines = getLedger(address);
    const header = "date,run_id,goal,service,usdc,tx_hash,explorer_url,network\n";
    const rows = lines.map((l) =>
      [
        l.createdAt,
        l.runId,
        `"${l.goal.replace(/"/g, '""')}"`,
        l.service,
        l.usdc.toFixed(6),
        l.txHash,
        l.explorerUrl,
        l.network,
      ].join(","),
    );
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=x402-ledger.csv");
    res.send(header + rows.join("\n"));
  } catch (err) {
    res.status(401).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.get("/api/agents/custom", async (req, res) => {
  try {
    const didToken = req.headers.authorization?.replace(/^Bearer\s+/i, "") ?? (req.query.didToken as string);
    const address = await requireMagicAddress(didToken);
    res.json(listCustomAgents(address));
  } catch (err) {
    res.status(401).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/api/agents/custom", async (req, res) => {
  try {
    const { didToken, name, description, goal, suggestedBudget } = req.body as {
      didToken?: string;
      name?: string;
      description?: string;
      goal?: string;
      suggestedBudget?: number;
    };
    const address = await requireMagicAddress(didToken);
    if (!name || !goal) {
      res.status(400).json({ error: "name and goal are required" });
      return;
    }
    const agent: CustomAgent = {
      id: randomUUID(),
      name,
      description: description ?? "",
      goal,
      suggestedBudget: Number(suggestedBudget) || 0.15,
      createdAt: new Date().toISOString(),
    };
    saveCustomAgent(address, agent);
    res.json(agent);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.delete("/api/agents/custom/:id", async (req, res) => {
  try {
    const { didToken } = req.body as { didToken?: string };
    const address = await requireMagicAddress(didToken);
    const ok = deleteCustomAgent(address, req.params.id);
    if (!ok) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    res.json({ deleted: true });
  } catch (err) {
    res.status(401).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/run/sign", (req, res) => {
  const { id, signature } = req.body as { id?: string; signature?: string };
  if (!id || !signature) {
    res.status(400).json({ error: "id and signature are required" });
    return;
  }
  try {
    fulfillSignRequest(id, signature);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/run/resume", (req, res) => {
  const { runId, approved, budget } = req.body as {
    runId?: string;
    approved?: boolean;
    budget?: number;
  };
  if (!runId) {
    res.status(400).json({ error: "runId is required" });
    return;
  }
  if (!hasPendingApproval(runId)) {
    res.status(404).json({ error: "No run awaiting approval" });
    return;
  }
  const budgetUsdc = Number(budget);
  if (approved && (!Number.isFinite(budgetUsdc) || budgetUsdc <= 0)) {
    res.status(400).json({ error: "budget must be a positive number when approving" });
    return;
  }
  try {
    resolvePlanApproval(runId, Boolean(approved), approved ? budgetUsdc : 0);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/run", async (req, res) => {
  const { goal, budget, stream, didToken, userToolPicks, approvedPlan } = req.body as {
    goal?: string;
    budget?: number;
    stream?: boolean;
    didToken?: string;
    userToolPicks?: string[];
    approvedPlan?: AgentPlan;
  };

  if (!goal || typeof goal !== "string") {
    res.status(400).json({ error: "goal is required" });
    return;
  }
  if (!didToken) {
    res.status(401).json({ error: "Magic login required — didToken missing" });
    return;
  }

  const budgetUsdc = Number(budget);
  if (!Number.isFinite(budgetUsdc) || budgetUsdc <= 0) {
    res.status(400).json({ error: "budget must be a positive number (USDC)" });
    return;
  }

  const runId = randomUUID();
  let userAddress: `0x${string}` | null = null;
  try {
    userAddress = await requireMagicAddress(didToken);
  } catch {
  }

  const picks = Array.isArray(userToolPicks)
    ? userToolPicks.filter((p): p is string => typeof p === "string" && p.trim().length > 0)
    : undefined;

  const runOpts = {
    goal,
    budgetUsdc,
    didToken,
    requireMagic: true,
    requirePlanApproval: false,
    runId,
    userToolPicks: picks,
    approvedPlan,
  };

  if (stream) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    let finalResult: RunResult | null = null;
    let stopped = false;

    const send = (event: RunEvent) => {
      if (event.type === "done") finalResult = event.result;
      // EIP-3009 / viem typed-data may contain BigInt — JSON.stringify would throw.
      res.write(`data: ${JSON.stringify(jsonSafeDeep(event))}\n\n`);
    };

    try {
      await runAgent({ ...runOpts, onEvent: send });
      if (userAddress && finalResult) {
        persistCompletedRun(userAddress, runId, goal, budgetUsdc, finalResult, "completed");
      }
      res.end();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("aborted") || message.includes("cancelled")) stopped = true;
      send({ type: "error", message });
      if (userAddress) {
        persistCompletedRun(
          userAddress,
          runId,
          goal,
          budgetUsdc,
          finalResult,
          stopped ? "stopped" : "failed",
          message,
        );
      }
      res.end();
    }
    return;
  }

  try {
    const result = await runAgent(runOpts);
    if (userAddress) {
      persistCompletedRun(userAddress, runId, goal, budgetUsdc, result, "completed");
    }
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (userAddress) {
      persistCompletedRun(
        userAddress,
        runId,
        goal,
        budgetUsdc,
        null,
        message.includes("aborted") || message.includes("cancelled") ? "stopped" : "failed",
        message,
      );
    }
    res.status(500).json({ error: message });
  }
});

app.post("/run/stop", (_req, res) => {
  abortRun();
  res.json({ stopped: true });
});

app.get("/app", (_req, res) => {
  res.sendFile(path.join(publicDir, "app.html"));
});

app.use(express.static(publicDir));

app.listen(PORT, process.env.HOST ?? "0.0.0.0", () => {
  const host = process.env.HOST ?? "0.0.0.0";
  console.log(`x402 Agentic Orchestrator listening on http://${host}:${PORT}`);
  console.log(`  (Magic login: use localhost — not 127.0.0.1 — unless allowlisted in Magic Dashboard)`);
  console.log(`  Seller network: ${getNetworkMode()} (${network})`);
  console.log(`  Payments: ${getNetworkMode() === "mainnet" ? "Base mainnet" : "Base Sepolia (via service URLs)"}`);
  console.log(`  Landing: http://localhost:${PORT}/`);
  console.log(`  App:     http://localhost:${PORT}/app`);
});
