import { tavilyEstimateCost } from "../services/tavily.js";
import { coingeckoEstimateCost } from "../services/coingecko.js";
import { firecrawlEstimateCost, isFirecrawlEnabled } from "../services/firecrawl.js";
import { browserbaseEstimateCost } from "../services/browserbase.js";
import { exaEstimateCost } from "../services/exa.js";
import { synthesizeEstimateCost } from "../services/seller.js";

export type ServiceName =
  | "tavily"
  | "coingecko"
  | "firecrawl"
  | "browserbase"
  | "exa"
  | "synthesize";

export interface PlanStep {
  service: ServiceName;
  endpoint: string;
  estCostUsdc: number;
  params?: Record<string, unknown>;
}

export interface AgentPlan {
  goal: string;
  steps: PlanStep[];
  totalEstUsdc: number;
}

function matchesAny(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((k) => lower.includes(k));
}

function selectServices(goal: string): ServiceName[] {
  const services = new Set<ServiceName>();

  if (
    matchesAny(goal, ["price", "crypto", "bitcoin", "ethereum", "btc", "eth", "sol", "token", "market cap"])
  ) {
    services.add("coingecko");
  }
  if (
    isFirecrawlEnabled() &&
    matchesAny(goal, ["crawl", "scrape", "monitor", "site", "web page"])
  ) {
    services.add("firecrawl");
  }
  if (matchesAny(goal, ["browse", "browser", "session", "screenshot", "interact"])) {
    services.add("browserbase");
  }
  if (matchesAny(goal, ["semantic", "research paper", "primary source", "investigate", "deep"])) {
    services.add("exa");
  }

  services.add("tavily");
  services.add("synthesize");
  return [...services];
}

async function estimateStep(
  service: ServiceName,
  goal: string,
): Promise<PlanStep> {
  switch (service) {
    case "tavily":
      return {
        service,
        endpoint: "POST https://x402.tavily.com/search",
        estCostUsdc: await tavilyEstimateCost(goal),
        params: { query: goal },
      };
    case "coingecko":
      return {
        service,
        endpoint: "GET https://pro-api.coingecko.com/api/v3/x402/simple/price",
        estCostUsdc: await coingeckoEstimateCost(),
        params: { symbols: ["btc", "eth", "sol"], vs: ["usd"] },
      };
    case "firecrawl":
      return {
        service,
        endpoint: "POST https://api.firecrawl.dev/v1/x402/search",
        estCostUsdc: await firecrawlEstimateCost(goal),
        params: { query: goal },
      };
    case "browserbase":
      return {
        service,
        endpoint: "POST https://x402.browserbase.com/browser/session/create",
        estCostUsdc: await browserbaseEstimateCost(),
      };
    case "exa":
      return {
        service,
        endpoint: "POST https://api.exa.ai/search",
        estCostUsdc: await exaEstimateCost(goal),
        params: { query: goal },
      };
    case "synthesize":
      return {
        service,
        endpoint: "POST /synthesize (Arbitrum settlement)",
        estCostUsdc: await synthesizeEstimateCost(),
      };
  }
}

export async function createPlan(goal: string): Promise<AgentPlan> {
  const services = selectServices(goal);
  const steps: PlanStep[] = [];

  for (const service of services) {
    if (service !== "synthesize") {
      steps.push(await estimateStep(service, goal));
    }
  }
  steps.push(await estimateStep("synthesize", goal));

  const totalEstUsdc = steps.reduce((sum, s) => sum + s.estCostUsdc, 0);
  return { goal, steps, totalEstUsdc };
}
