import { arbitrum, arbitrumSepolia, base, baseSepolia } from "viem/chains";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { createFacilitatorConfig } from "@coinbase/x402";

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
  if (network === CAIP2.arbitrum) return `https://arbiscan.io/tx/${txHash}`;
  if (network === CAIP2.arbitrumSepolia) return `https://sepolia.arbiscan.io/tx/${txHash}`;
  if (network === CAIP2.base) return `https://basescan.org/tx/${txHash}`;
  if (network === CAIP2.baseSepolia) return `https://sepolia.basescan.org/tx/${txHash}`;
  throw new Error(`Unknown explorer network: ${network}`);
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
export function createCdpFacilitatorClient(): HTTPFacilitatorClient {
  const keyId = requireEnv("CDP_API_KEY_ID");
  const keySecret = requireEnv("CDP_API_KEY_SECRET");
  return new HTTPFacilitatorClient(createFacilitatorConfig(keyId, keySecret));
}

/**
 * Facilitator for /synthesize seller settlement.
 * Mainnet: CDP (Arbitrum One). Testnet: local Arbitrum Sepolia facilitator (CDP does not list 421614).
 */
export function createSellerFacilitatorClient(): HTTPFacilitatorClient {
  if (getNetworkMode() === "mainnet") {
    return createCdpFacilitatorClient();
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
