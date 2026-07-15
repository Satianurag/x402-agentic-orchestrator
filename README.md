# x402 Agentic Orchestrator

Pay-per-use AI agent that completes an end-to-end job by autonomously paying x402 micro-services in USDC, bounded by an on-chain EOA budget.

## Architecture

| Layer | Role |
|-------|------|
| **EOA** | Signs x402 payments on Base (Sepolia testnet / mainnet live) |
| **UA** (Particle EIP-7702) | Cross-chain top-up: unified UA balance → EOA at run start |
| **Magic** (UI) | Email/OTP login; embedded wallet is the EIP-7702 owner & signer via SSE sign bridge |
| **PRIVATE_KEY** (CLI) | CLI/E2E signer only — not required to match Magic |
| **Seller** `/synthesize` | Arbitrum Sepolia (testnet) or Arbitrum One (mainnet demo) + Gemini synthesis |

**Testnet (default `NETWORK=sepolia`):**

- Buyer x402 payments: **Base Sepolia** via CDP facilitator
- Third-party services: **dev-harness** (real x402 + real upstream APIs, not mocks)
- `/synthesize`: **Arbitrum Sepolia** via local facilitator (`dev-harness/facilitator.ts`)

**Mainnet demo (`NETWORK=mainnet`):** point service `*_BASE_URL` envs at live x402 endpoints.

## Setup

```bash
cp .env.example .env
# Fill ALL keys — missing keys throw at runtime (no fallbacks)
npm install
npm run typecheck
```

Fund before running:

1. **Circle faucet** — USDC on Base Sepolia + Arbitrum Sepolia for your EOA/facilitator
2. **Universal Account** — USDC unified balance for UA cross-chain top-up
3. **Facilitator wallet** — `FACILITATOR_PRIVATE_KEY` needs Arbitrum Sepolia ETH for gas

## Testnet run (4 terminals)

```bash
# 1 — Arbitrum Sepolia x402 facilitator (seller settlement)
npm run dev-harness:facilitator

# 2 — Base Sepolia x402 service proxies (Tavily, CoinGecko, …)
npm run dev-harness

# 3 — Seller + UI
npm start

# 4 — CLI agent run
npm run cli -- --goal "BTC price brief" --budget 0.15 --network sepolia
```

UI: http://localhost:4020 (Magic login; signs UA 7702 + x402 via delegated SSE)

## E2E proof

With all three servers running (facilitator, dev-harness, seller):

```bash
npm run test:e2e
```

Asserts:

1. Real Particle UA `transactionId` for cross-chain top-up
2. ≥1 on-chain tx on **Base Sepolia** (dev-harness x402)
3. On-chain tx on **Arbitrum Sepolia** for `/synthesize`
4. Non-empty Gemini deliverable

Prints every explorer link; fails on missing/fake values.

## Mainnet demo (single step after testnet passes)

```bash
# .env: NETWORK=mainnet, point *_BASE_URL at live x402 services, mainnet RPCs
npm run cli -- --goal "BTC price brief" --budget 0.50 --network mainnet
```

## Budget enforcement

1. `fundRunWallet(cap)` — UA cross-chain transfer → EOA (7702 path when needed)
2. `preCheck(quote)` — in-memory cap + on-chain Base USDC check
3. x402 payments drain EOA; insufficient USDC = chain rejection

## No fallbacks

- Cost estimates: live HTTP 402 probe only (throws on failure)
- Payments: require `PAYMENT-RESPONSE` settlement header (v2)
- Synthesis: Gemini only (`gemini-3.1-flash-lite` via `@google/genai`, `GEMINI_API_KEY` required)
- RPC URLs: required env vars (no public default RPCs)
