# x402 Agentic Orchestrator

Pay-per-use AI agent that completes an end-to-end job by autonomously paying x402 micro-services in USDC, bounded by an on-chain EOA budget on Base.

## Architecture (fixed)

| Layer | Role |
|-------|------|
| **EOA** (`PRIVATE_KEY`) | Signs all x402 payments on Base mainnet; on-chain USDC balance = hard cap |
| **UA** (Particle 7702) | Cross-chain top-up: unified balance → EOA on Base at run start (guaranteed 7702 tx) |
| **Magic** | UI email/OTP login; `didToken` verified server-side; must match `PRIVATE_KEY` EOA |
| **Seller** `/synthesize` | Arbitrum One (mainnet) settlement + OpenAI LLM synthesis |

External x402 services (Tavily, CoinGecko, etc.) **always settle on Base mainnet** — requires `NETWORK=mainnet`.

## Setup

```bash
cp .env.example .env
# Fill ALL keys — no fallbacks; missing keys throw at runtime
npm install
npm run typecheck
```

### Required `.env`

| Key | Purpose |
|-----|---------|
| `NETWORK` | `mainnet` (required for live agent runs) |
| `PRIVATE_KEY` | EOA that pays x402 — **must match Magic wallet address** |
| `PARTICLE_*` | Universal Account project |
| `MAGIC_SECRET_KEY` / `MAGIC_PUBLISHABLE_KEY` | Auth |
| `CDP_API_KEY_*` | Facilitator (required) |
| `SELLER_PAY_TO` | Receives Arbitrum USDC on `/synthesize` |
| `OPENAI_API_KEY` | LLM deliverable synthesis |
| `BASE_RPC_URL` | Base mainnet RPC |

Fund before running:
1. **Universal Account** — USDC (cross-chain unified balance) for UA top-up
2. **EOA on Base** — will receive top-up; chain rejects payments when empty

## Run

```bash
npm start          # UI at http://localhost:4020 (Magic login required)
npm run cli -- --goal "BTC price brief" --budget 0.15 --network mainnet
```

## Budget enforcement (real)

1. `fundRunWallet(cap)` — UA cross-chain transfer → EOA on Base (7702 path)
2. `preCheck(quote)` — in-memory cap + on-chain EOA Base USDC check
3. x402 payments drain EOA; insufficient USDC = chain rejection

## No fallbacks

- Cost estimates: live `402` probe only (throws on failure)
- Payments: require `PAYMENT-RESPONSE` settlement header
- Synthesis: OpenAI only (no JSON concat)
- External services: blocked unless `NETWORK=mainnet`
