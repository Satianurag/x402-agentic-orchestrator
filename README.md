# x402 Agentic Orchestrator

Pay-per-use AI agent for the [UXmaxx Hackathon](https://www.encodeclub.com/programmes/uxmaxx-hackathon) — **Magic** login, **Particle Universal Account** cross-chain top-up, **Arbitrum** synthesis settlement, and **Bazaar MCP** tool execution on Base.

## Architecture

| Layer | Role |
|-------|------|
| **Magic** | Email login; embedded wallet signs x402 + EIP-7702 UA top-up |
| **Particle UA** | Cross-chain USDC top-up → run EOA on Base before payments |
| **Gemini LLM planner** | Picks minimum Bazaar tools per goal (cost + capability) |
| **CDP Bazaar MCP** | `search_resources` (free) + `proxy_tool_call` (paid) |
| **Seller `/synthesize`** | Arbitrum One + Gemini deliverable (x402 settlement) |

**Hackathon track:** UA + Arbitrum + Magic (not CDP embedded wallets).

## Flow

1. User enters goal (+ optional preferred tools)
2. LLM plans tools from Bazaar catalog; live 402 probe for estimates
3. User approves budget → UA tops up EOA if needed
4. Each research step: MCP `proxy_tool_call` (automatic x402 payment)
5. Final step: `/synthesize` on Arbitrum
6. **Follow-up Q&A** on deliverable (Gemini only — no new tool spend)

## Setup

```bash
cp .env.example .env
# Fill GEMINI_API_KEY, Magic, Particle, CDP, RPC URLs, SELLER_PAY_TO
npm install
npm run typecheck
npm start
```

UI: http://localhost:4020/app (use `localhost`, not `127.0.0.1`, for Magic)

## Tests ($0)

```bash
npm run test:estimate   # Bazaar MCP + LLM planner + goal validation
npm run test:e2e        # Server + plan smoke (no paid run)
E2E_PAID=1 npm run test:e2e   # Full paid run (requires funded wallet)
```

## CLI

```bash
# Plan only ($0)
npm run cli -- --goal "BTC price with sources" --estimate-only

# Full run (spends USDC)
npm run cli -- --goal "..." --budget 0.10 --tool "web-search"
```

## Budget enforcement

1. `fundRunWallet(cap)` — UA → EOA top-up when needed
2. `preCheck(quote)` — cap + on-chain balance before each x402 payment
3. MCP session records spend after settlement

## Planner notes

- **Default planner:** Gemini + CDP Bazaar (free discovery, pay only for tool calls)
- **[402.ad](https://402.ad/pricing) planner:** **$0.50/request** via x402 — search/detail free; not integrated (our Gemini planner is $0 except tool costs)
- Vague goals (`hi`, `test`) are rejected before planning

## No fallbacks

- Tool discovery: official CDP Bazaar MCP + `@x402/extensions` bazaar search
- Execution: `@x402/mcp` `wrapMCPClientWithPayment` only (no legacy HTTP wrappers)
- Synthesis: Gemini `gemini-3.1-flash-lite` only
