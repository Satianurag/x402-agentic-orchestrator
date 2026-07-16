import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import {
  createCdpFacilitatorClient,
  getNetworkMode,
  getSellerCaip2,
} from "../config/chains.js";
import { PREBUILT_AGENTS } from "../agent/prebuilt.js";
import { synthesizeWithLlm } from "../agent/synthesize-llm.js";
import { runAgent, abortRun, type RunEvent } from "../agent/run.js";
import { SELLER_PRICE_USDC } from "../services/seller.js";

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

const network = getSellerCaip2();
const facilitatorClient = createCdpFacilitatorClient();
const resourceServer = new x402ResourceServer(facilitatorClient).register(
  network,
  new ExactEvmScheme(),
);

const app = express();
app.use(express.json());

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
        description: "Synthesize a final deliverable from collected agent context (Arbitrum USDC)",
        mimeType: "application/json",
      },
    },
    resourceServer,
  ),
);

app.get("/api/config", (_req, res) => {
  res.json({
    magicPublishableKey,
    network: getNetworkMode(),
    sellerNetwork: network,
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

app.post("/run", async (req, res) => {
  const { goal, budget, stream, didToken } = req.body as {
    goal?: string;
    budget?: number;
    stream?: boolean;
    didToken?: string;
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

  const runOpts = {
    goal,
    budgetUsdc,
    didToken,
    requireMagic: true,
  };

  if (stream) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const send = (event: RunEvent) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    try {
      const result = await runAgent({ ...runOpts, onEvent: send });
      send({ type: "done", result });
      res.end();
    } catch (err) {
      send({ type: "error", message: err instanceof Error ? err.message : String(err) });
      res.end();
    }
    return;
  }

  try {
    const result = await runAgent(runOpts);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/run/stop", (_req, res) => {
  abortRun();
  res.json({ stopped: true });
});

app.use(express.static(publicDir));

app.listen(PORT, () => {
  console.log(`x402 Agentic Orchestrator listening on http://localhost:${PORT}`);
  console.log(`  Seller network: ${getNetworkMode()} (${network})`);
  console.log(`  Payments: Base mainnet (${getNetworkMode() === "mainnet" ? "live" : "external blocked"})`);
  console.log(`  UI: http://localhost:${PORT}/`);
});
