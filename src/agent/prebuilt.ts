export interface PrebuiltAgent {
  id: string;
  name: string;
  description: string;
  goal: string;
  suggestedBudget: number;
}

export const PREBUILT_AGENTS: PrebuiltAgent[] = [
  {
    id: "market-research",
    name: "Market Research",
    description: "Web search + live crypto prices + synthesis",
    goal: "Research the latest market trends for Bitcoin and Ethereum with cited sources",
    suggestedBudget: 0.1,
  },
  {
    id: "web-monitor",
    name: "Web Monitor",
    description: "Crawl the web and summarize findings",
    goal: "Find and summarize recent news about x402 micropayments and agentic finance",
    suggestedBudget: 0.1,
  },
  {
    id: "deep-browse",
    name: "Deep Browse",
    description: "Semantic search + browser session + synthesis",
    goal: "Investigate how AI agents use x402 for autonomous payments with primary sources",
    suggestedBudget: 0.1,
  },
  {
    id: "crypto-brief",
    name: "Crypto Brief",
    description: "Price data + web context brief",
    goal: "Produce a crypto brief on SOL, ETH, and BTC prices and recent catalysts",
    suggestedBudget: 0.1,
  },
];

export function getPrebuiltAgent(id: string): PrebuiltAgent | undefined {
  return PREBUILT_AGENTS.find((a) => a.id === id);
}
