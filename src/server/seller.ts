import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { createCdpFacilitatorClient } from "../config/chains.js";
import { getArbitrumCaip2, getNetworkMode } from "../config/chains.js";
import { PREBUILT_AGENTS } from "../agent/prebuilt.js";
import { runAgent, abortRun, type RunEvent } from "../agent/run.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "../../public");
const PORT = Number(process.env.PORT ?? 4020);

const payTo = process.env.SELLER_PAY_TO;
if (!payTo) {
  console.warn("[seller] SELLER_PAY_TO not set — x402 /synthesize route will fail until configured");
}

const network = getArbitrumCaip2();
const facilitatorClient = createCdpFacilitatorClient();
const resourceServer = new x402ResourceServer(facilitatorClient).register(
  network,
  new ExactEvmScheme(),
);

const app = express();
app.use(express.json());

if (payTo) {
  app.use(
    paymentMiddleware(
      {
        "POST /synthesize": {
          accepts: [
            {
              scheme: "exact",
              price: "$0.002",
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
}

app.post("/synthesize", (req, res) => {
  const { goal, context } = req.body as { goal?: string; context?: unknown[] };
  const items = context ?? [];

  const sections = items.map((item, i) => {
    const entry = item as { service?: string; data?: unknown; error?: string };
    if (entry.error) {
      return `## Step ${i + 1}: ${entry.service ?? "unknown"}\n\n_Error: ${entry.error}_`;
    }
    return `## Step ${i + 1}: ${entry.service ?? "unknown"}\n\n\`\`\`json\n${JSON.stringify(entry.data, null, 2).slice(0, 4000)}\n\`\`\``;
  });

  const deliverable = [
    `# Deliverable`,
    ``,
    `**Goal:** ${goal ?? "N/A"}`,
    ``,
    `**Network:** ${getNetworkMode()} (${network})`,
    ``,
    `---`,
    ``,
    ...sections,
    ``,
    `---`,
    ``,
    `_Synthesized by x402 Agentic Orchestrator — Arbitrum settlement proof via /synthesize._`,
  ].join("\n");

  res.json({ deliverable, goal, stepCount: items.length });
});

app.get("/agents", (_req, res) => {
  res.json(PREBUILT_AGENTS);
});

app.post("/run", async (req, res) => {
  const { goal, budget, stream } = req.body as {
    goal?: string;
    budget?: number;
    stream?: boolean;
  };

  if (!goal || typeof goal !== "string") {
    res.status(400).json({ error: "goal is required" });
    return;
  }
  const budgetUsdc = Number(budget);
  if (!Number.isFinite(budgetUsdc) || budgetUsdc <= 0) {
    res.status(400).json({ error: "budget must be a positive number (USDC)" });
    return;
  }

  if (stream) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const send = (event: RunEvent) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    try {
      const result = await runAgent({ goal, budgetUsdc, onEvent: send });
      send({ type: "done", result });
      res.end();
    } catch (err) {
      send({ type: "error", message: err instanceof Error ? err.message : String(err) });
      res.end();
    }
    return;
  }

  try {
    const result = await runAgent({ goal, budgetUsdc });
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
  console.log(`  Network: ${getNetworkMode()} (${network})`);
  console.log(`  UI:      http://localhost:${PORT}/`);
});
