import "dotenv/config";
import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import type { RoutesConfig } from "@x402/core/server";
import { createCdpFacilitatorClient } from "@coinbase/cdp-sdk/x402";
import { CAIP2 } from "../src/config/chains.js";

const PORT = Number(process.env.DEV_HARNESS_PORT ?? 4030);
const payTo = process.env.DEV_HARNESS_PAY_TO as `0x${string}` | undefined;
if (!payTo) {
  throw new Error("DEV_HARNESS_PAY_TO is required — receives Base Sepolia USDC for harness x402 routes");
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}

const facilitatorClient = createCdpFacilitatorClient();
const network = CAIP2.baseSepolia;
const resourceServer = new x402ResourceServer(facilitatorClient).register(
  network,
  new ExactEvmScheme(),
);

const app = express();
app.use(express.json());

const tavilyRoutes: RoutesConfig = {
  "POST /tavily/search": {
    accepts: [{ scheme: "exact", price: "$0.01", network, payTo }],
    description: "Tavily search (testnet harness)",
    mimeType: "application/json",
  },
};

app.use(paymentMiddleware(tavilyRoutes, resourceServer));
app.post("/tavily/search", async (req, res) => {
  const apiKey = requireEnv("HARNESS_TAVILY_API_KEY");
  const query = (req.body as { query?: string }).query;
  if (!query) {
    res.status(400).json({ error: "query is required" });
    return;
  }
  const upstream = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ api_key: apiKey, query, max_results: 5 }),
  });
  const text = await upstream.text();
  res.status(upstream.status).type(upstream.headers.get("content-type") ?? "application/json").send(text);
});

const coingeckoRoutes: RoutesConfig = {
  "GET /coingecko/x402/simple/price": {
    accepts: [{ scheme: "exact", price: "$0.001", network, payTo }],
    description: "CoinGecko simple price (testnet harness)",
    mimeType: "application/json",
  },
};

app.use(paymentMiddleware(coingeckoRoutes, resourceServer));
app.get("/coingecko/x402/simple/price", async (req, res) => {
  const qs = new URLSearchParams(req.query as Record<string, string>).toString();
  const upstream = await fetch(`https://api.coingecko.com/api/v3/simple/price?${qs}`);
  const text = await upstream.text();
  res.status(upstream.status).type(upstream.headers.get("content-type") ?? "application/json").send(text);
});

const firecrawlRoutes: RoutesConfig = {
  "POST /firecrawl/search": {
    accepts: [{ scheme: "exact", price: "$0.02", network, payTo }],
    description: "Firecrawl search (testnet harness)",
    mimeType: "application/json",
  },
};

app.use(paymentMiddleware(firecrawlRoutes, resourceServer));
app.post("/firecrawl/search", async (req, res) => {
  const apiKey = requireEnv("HARNESS_FIRECRAWL_API_KEY");
  const query = (req.body as { query?: string }).query;
  if (!query) {
    res.status(400).json({ error: "query is required" });
    return;
  }
  const upstream = await fetch("https://api.firecrawl.dev/v1/search", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query, limit: 5 }),
  });
  const text = await upstream.text();
  res.status(upstream.status).type(upstream.headers.get("content-type") ?? "application/json").send(text);
});

const browserbaseRoutes: RoutesConfig = {
  "POST /browserbase/browser/session/create": {
    accepts: [{ scheme: "exact", price: "$0.05", network, payTo }],
    description: "Browserbase session create (testnet harness)",
    mimeType: "application/json",
  },
};

app.use(paymentMiddleware(browserbaseRoutes, resourceServer));
app.post("/browserbase/browser/session/create", async (_req, res) => {
  const apiKey = requireEnv("HARNESS_BROWSERBASE_API_KEY");
  const projectId = requireEnv("HARNESS_BROWSERBASE_PROJECT_ID");
  const upstream = await fetch("https://api.browserbase.com/v1/sessions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-bb-api-key": apiKey,
    },
    body: JSON.stringify({ projectId }),
  });
  const text = await upstream.text();
  res.status(upstream.status).type(upstream.headers.get("content-type") ?? "application/json").send(text);
});

const exaRoutes: RoutesConfig = {
  "POST /exa/search": {
    accepts: [{ scheme: "exact", price: "$0.01", network, payTo }],
    description: "Exa search (testnet harness)",
    mimeType: "application/json",
  },
};

app.use(paymentMiddleware(exaRoutes, resourceServer));
app.post("/exa/search", async (req, res) => {
  const apiKey = requireEnv("HARNESS_EXA_API_KEY");
  const query = (req.body as { query?: string }).query;
  if (!query) {
    res.status(400).json({ error: "query is required" });
    return;
  }
  const upstream = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({ query, numResults: 5 }),
  });
  const text = await upstream.text();
  res.status(upstream.status).type(upstream.headers.get("content-type") ?? "application/json").send(text);
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, network });
});

app.listen(PORT, () => {
  console.log(`x402 dev-harness listening on http://localhost:${PORT}`);
  console.log(`  Network: ${network}`);
  console.log(`  Pay-to: ${payTo}`);
  console.log("  Routes: /tavily/search, /coingecko/x402/simple/price, /firecrawl/search, /browserbase/browser/session/create, /exa/search");
});
