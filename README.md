# x402 Agentic Orchestrator

Pay-per-use AI agent that completes an end-to-end job by autonomously paying multiple x402 micro-services in USDC, bounded by an on-chain budget.

## Stack

- **TypeScript** / Node 20+ / ESM
- **Particle Universal Accounts** (`@particle-network/universal-account-sdk`) — EIP-7702 mode
- **Magic** (`magic-sdk`, `@magic-sdk/admin`) — embedded wallet / server token validation
- **x402 v2** (`@x402/fetch`, `@x402/express`, `@x402/evm`, `@x402/core`)
- **Settlement chain (our seller):** Arbitrum One / Arbitrum Sepolia via Coinbase CDP facilitator
- **UI:** plain HTML + CSS + vanilla JS in `public/`

## What one run does

1. User picks a prebuilt agent or enters a custom goal + USDC budget.
2. Agent builds a **plan** (services, endpoints, estimated cost).
3. Agent **executes** each step via `@x402/fetch` (402 → sign USDC → retry).
4. **Budget guard** funds the run wallet and pre-checks each quote; on-chain balance is the hard cap.
5. Returns a **deliverable** + spend report (per-call cost, tx hash, explorer link).

## Prerequisites

- Node 20+
- [Particle](https://dashboard.particle.network) project (`PARTICLE_PROJECT_ID`, `PARTICLE_CLIENT_KEY`, `PARTICLE_APP_ID`)
- [Magic](https://dashboard.magic.link) keys (for production embedded-wallet 7702 flows)
- [CDP](https://cdp.coinbase.com) API keys for the Arbitrum facilitator
- A funded EOA (`PRIVATE_KEY`) — dev/CLI signer that owns the Universal Account
- Arbitrum Sepolia (or mainnet) USDC + ETH for gas

## Setup

```bash
cd uxmaxx
cp .env.example .env
# fill in all keys
npm install
```

### Required `.env` keys

| Variable | Description |
|----------|-------------|
| `NETWORK` | `sepolia` (default) or `mainnet` |
| `PRIVATE_KEY` | Run wallet owner EOA (dev/CLI; Magic EOA in production UI) |
| `PARTICLE_PROJECT_ID` | Particle dashboard |
| `PARTICLE_CLIENT_KEY` | Particle dashboard |
| `PARTICLE_APP_ID` | Particle dashboard |
| `MAGIC_SECRET_KEY` | Magic admin secret |
| `MAGIC_PUBLISHABLE_KEY` | Magic publishable key (browser flows) |
| `ARBITRUM_RPC_URL` | Arbitrum Sepolia RPC |
| `ARBITRUM_MAINNET_RPC_URL` | Arbitrum One RPC (mainnet) |
| `SELLER_PAY_TO` | Address that receives USDC on `/synthesize` |
| `CDP_API_KEY_ID` | CDP facilitator auth |
| `CDP_API_KEY_SECRET` | CDP facilitator auth |
| `CDP_FACILITATOR_URL` | Default: `https://api.cdp.coinbase.com/platform/v2/x402` |
| `PORT` | Server port (default `4020`) |
| `SELLER_BASE_URL` | Base URL for agent to call `/synthesize` (default `http://localhost:4020`) |

USDC addresses are loaded from [Circle's official list](https://developers.circle.com/stablecoins/usdc-contract-addresses) in `src/config/chains.ts` — not hardcoded from memory.

## Run

### Backend + UI

```bash
npm start
# open http://localhost:4020
```

### CLI

```bash
npm run cli -- --goal "Research Bitcoin trends" --budget 0.50 --network sepolia
```

### Typecheck

```bash
npm run typecheck
```

## Project layout

```
src/
  config/chains.ts      # Arbitrum/Base chains, Circle USDC, CAIP-2, CDP facilitator
  wallet/ua.ts          # Particle UA (7702) + Magic admin helpers
  budget/guard.ts       # fundRunWallet, getRemaining, preCheck
  services/*.ts         # x402 clients (Tavily, CoinGecko, Firecrawl, Browserbase, Exa, seller)
  agent/plan.ts         # goal → plan
  agent/run.ts          # execute plan + synthesize deliverable
  server/seller.ts      # Express: x402 /synthesize, REST, static UI
  cli.ts                # terminal runner
public/
  index.html, styles.css, app.js
```

## x402 services consumed

| Service | Endpoint |
|---------|----------|
| Tavily | `POST https://x402.tavily.com/search` |
| CoinGecko | `GET https://api.coingecko.com/x402/simple/price` |
| Firecrawl | `POST https://api.firecrawl.dev/v1/x402/search` |
| Browserbase | `POST https://x402.browserbase.com/browser/session/create` |
| Exa | `POST https://api.exa.ai/search` |
| **Our seller** | `POST /synthesize` (Arbitrum USDC via CDP facilitator) |

## Notes

- **7702 mode** requires an embedded wallet signer (Magic). CLI/dev uses `PRIVATE_KEY` with viem `signAuthorization` for inline 7702 delegation.
- External x402 services mostly settle on **Base**; our `/synthesize` route settles on **Arbitrum** for proof.
- Never commit `.env` or real keys.
