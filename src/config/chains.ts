import { arbitrum, arbitrumSepolia, base, baseSepolia } from "viem/chains";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { createCdpFacilitatorClient } from "@coinbase/cdp-sdk/x402";

/** Circle official USDC — https://developers.circle.com/stablecoins/usdc-contract-addresses */
export const USDC_ADDRESSES = {
  arbitrum: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" as const,
  arbitrumSepolia: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d" as const,
  base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const,
  baseSepolia: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const,
} as const;

export const CAIP2 = {
  arbitrum: "eip155:42161" as const,
  arbitrumSepolia: "eip155:421614" as const,
  base: "eip155:8453" as const,
  baseSepolia: "eip155:84532" as const,
} as const;

export type NetworkMode = "sepolia" | "mainnet";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}

export function getNetworkMode(): NetworkMode {
  const raw = (process.env.NETWORK ?? "sepolia").toLowerCase();
  return raw === "mainnet" ? "mainnet" : "sepolia";
}

/** x402 buyer payments settle on Base (Sepolia for testnet). */
export function getPaymentChain() {
  return getNetworkMode() === "mainnet" ? base : baseSepolia;
}

export function getPaymentCaip2() {
  return getNetworkMode() === "mainnet" ? CAIP2.base : CAIP2.baseSepolia;
}

export function getPaymentUsdc() {
  return getNetworkMode() === "mainnet" ? USDC_ADDRESSES.base : USDC_ADDRESSES.baseSepolia;
}

export function getBaseRpcUrl(): string {
  return requireEnv("BASE_RPC_URL");
}

/** Our /synthesize seller settles on Arbitrum (One for demo, Sepolia for testnet). */
export function getSellerChain() {
  return getNetworkMode() === "mainnet" ? arbitrum : arbitrumSepolia;
}

export function getSellerCaip2() {
  return getNetworkMode() === "mainnet" ? CAIP2.arbitrum : CAIP2.arbitrumSepolia;
}

export function getSellerUsdc() {
  return getNetworkMode() === "mainnet" ? USDC_ADDRESSES.arbitrum : USDC_ADDRESSES.arbitrumSepolia;
}

export function getSellerRpcUrl(): string {
  if (getNetworkMode() === "mainnet") {
    return requireEnv("ARBITRUM_MAINNET_RPC_URL");
  }
  return requireEnv("ARBITRUM_RPC_URL");
}

/** Particle UA transfer target chain id (numeric; SDK enum is mainnet-only). */
export function getUaTopUpChainId(): number {
  return getNetworkMode() === "mainnet" ? 8453 : 84532;
}

export function getExplorerTxUrl(txHash: string, network: string): string {
  const base = resolveExplorerBaseUrl(network);
  return `${base}${txHash}`;
}

const EXPLORER_BASE_BY_CAIP2: Record<string, string> = {
  [CAIP2.arbitrum]: "https://arbiscan.io/tx/",
  [CAIP2.arbitrumSepolia]: "https://sepolia.arbiscan.io/tx/",
  [CAIP2.base]: "https://basescan.org/tx/",
  [CAIP2.baseSepolia]: "https://sepolia.basescan.org/tx/",
};

const EXPLORER_ALIASES: Record<string, keyof typeof EXPLORER_BASE_BY_CAIP2> = {
  arbitrum: CAIP2.arbitrum,
  "arbitrum-one": CAIP2.arbitrum,
  "arbitrum one": CAIP2.arbitrum,
  "arbitrum sepolia": CAIP2.arbitrumSepolia,
  arb: CAIP2.arbitrum,
  base: CAIP2.base,
  "base mainnet": CAIP2.base,
  "base sepolia": CAIP2.baseSepolia,
  "42161": CAIP2.arbitrum,
  "421614": CAIP2.arbitrumSepolia,
  "8453": CAIP2.base,
  "84532": CAIP2.baseSepolia,
};

function resolveExplorerBaseUrl(network: string): string {
  const trimmed = network.trim();
  if (!trimmed) {
    console.warn("[explorer] empty settlement network — using blockscan fallback");
    return "https://blockscan.com/tx/";
  }

  if (EXPLORER_BASE_BY_CAIP2[trimmed]) return EXPLORER_BASE_BY_CAIP2[trimmed];

  const lower = trimmed.toLowerCase();
  if (EXPLORER_BASE_BY_CAIP2[lower]) return EXPLORER_BASE_BY_CAIP2[lower];

  const aliasKey = EXPLORER_ALIASES[lower];
  if (aliasKey) return EXPLORER_BASE_BY_CAIP2[aliasKey];

  const caipMatch = /^eip155:(\d+)$/i.exec(lower);
  if (caipMatch) {
    const chainId = caipMatch[1];
    const byId = EXPLORER_ALIASES[chainId];
    if (byId) return EXPLORER_BASE_BY_CAIP2[byId];
  }

  console.warn(`[explorer] unknown settlement network "${network}" — using blockscan fallback`);
  return "https://blockscan.com/tx/";
}

export const USDC_DECIMALS = 6;

export function usdcToAtomic(amount: number): bigint {
  return BigInt(Math.round(amount * 10 ** USDC_DECIMALS));
}

export function atomicToUsdc(amount: bigint | string | number): number {
  const n = typeof amount === "bigint" ? Number(amount) : Number(amount);
  return n / 10 ** USDC_DECIMALS;
}

/** CDP facilitator for Base Sepolia / Base mainnet buyer payments. */
export function getCdpFacilitatorClient(): HTTPFacilitatorClient {
  return createCdpFacilitatorClient() as unknown as HTTPFacilitatorClient;
}

/**
 * Facilitator for /synthesize seller settlement.
 * Mainnet: CDP supports eip155:42161 (Arbitrum One) — see CDP x402 network identifiers.
 * Testnet: local Arbitrum Sepolia facilitator (CDP does not list 421614).
 */
export function createSellerFacilitatorClient(): HTTPFacilitatorClient {
  if (getNetworkMode() === "mainnet") {
    return getCdpFacilitatorClient();
  }
  const url = requireEnv("ARBITRUM_SEPOLIA_FACILITATOR_URL");
  return new HTTPFacilitatorClient({ url });
}

/** Mainnet x402 service roots (used when env override is unset). */
export const SERVICE_BASE_URLS = {
  TAVILY: "https://x402.tavily.com",
  COINGECKO: "https://pro-api.coingecko.com/api/v3",
  FIRECRAWL: "https://api.firecrawl.dev/v1/x402",
  BROWSERBASE: "https://x402.browserbase.com",
  EXA: "https://api.exa.ai",
} as const;

export function requireServiceBaseUrl(envVar: string, fallbackUrl: string): string {
  const v = process.env[envVar] ?? fallbackUrl;
  return v.replace(/\/$/, "");
}
