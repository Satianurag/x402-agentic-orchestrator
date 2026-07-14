import { arbitrum, arbitrumSepolia, base } from "viem/chains";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { createFacilitatorConfig } from "@coinbase/x402";

/** Circle official USDC — https://developers.circle.com/stablecoins/usdc-contract-addresses */
export const USDC_ADDRESSES = {
  arbitrum: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" as const,
  arbitrumSepolia: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d" as const,
  base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const,
} as const;

export const CAIP2 = {
  arbitrum: "eip155:42161" as const,
  arbitrumSepolia: "eip155:421614" as const,
  base: "eip155:8453" as const,
} as const;

export type NetworkMode = "sepolia" | "mainnet";

export function getNetworkMode(): NetworkMode {
  const raw = (process.env.NETWORK ?? "mainnet").toLowerCase();
  return raw === "sepolia" ? "sepolia" : "mainnet";
}

/** Live x402 services (Tavily, CoinGecko, etc.) settle on Base mainnet only. */
export function getPaymentChain() {
  return base;
}

export function getPaymentCaip2() {
  return CAIP2.base;
}

export function getBaseRpcUrl() {
  return process.env.BASE_RPC_URL ?? base.rpcUrls.default.http[0];
}

/** Our /synthesize seller settles on Arbitrum (One for demo proof, Sepolia for test). */
export function getSellerChain() {
  return getNetworkMode() === "mainnet" ? arbitrum : arbitrumSepolia;
}

export function getSellerCaip2() {
  return getNetworkMode() === "mainnet" ? CAIP2.arbitrum : CAIP2.arbitrumSepolia;
}

export function getSellerUsdc() {
  return getNetworkMode() === "mainnet" ? USDC_ADDRESSES.arbitrum : USDC_ADDRESSES.arbitrumSepolia;
}

export function getSellerRpcUrl() {
  if (getNetworkMode() === "mainnet") {
    return process.env.ARBITRUM_MAINNET_RPC_URL ?? arbitrum.rpcUrls.default.http[0];
  }
  return process.env.ARBITRUM_RPC_URL ?? arbitrumSepolia.rpcUrls.default.http[0];
}

export function assertExternalServicesAvailable(): void {
  if (getNetworkMode() !== "mainnet") {
    throw new Error(
      "External x402 services require NETWORK=mainnet (they settle on Base mainnet USDC). " +
        "Use mainnet for live agent runs; sepolia is only for /synthesize seller testing.",
    );
  }
}

export function getExplorerTxUrl(txHash: string, network: string): string {
  if (network === CAIP2.arbitrum) return `https://arbiscan.io/tx/${txHash}`;
  if (network === CAIP2.arbitrumSepolia) return `https://sepolia.arbiscan.io/tx/${txHash}`;
  if (network === CAIP2.base) return `https://basescan.org/tx/${txHash}`;
  return `https://basescan.org/tx/${txHash}`;
}

export const USDC_DECIMALS = 6;

export function usdcToAtomic(amount: number): bigint {
  return BigInt(Math.round(amount * 10 ** USDC_DECIMALS));
}

export function atomicToUsdc(amount: bigint | string | number): number {
  const n = typeof amount === "bigint" ? Number(amount) : Number(amount);
  return n / 10 ** USDC_DECIMALS;
}

export function createCdpFacilitatorClient(): HTTPFacilitatorClient {
  const keyId = process.env.CDP_API_KEY_ID;
  const keySecret = process.env.CDP_API_KEY_SECRET;

  if (!keyId || !keySecret) {
    throw new Error("CDP_API_KEY_ID and CDP_API_KEY_SECRET are required for the x402 facilitator");
  }

  return new HTTPFacilitatorClient(createFacilitatorConfig(keyId, keySecret));
}
