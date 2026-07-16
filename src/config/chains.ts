import { arbitrum, arbitrumSepolia, base, baseSepolia } from "viem/chains";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { createFacilitatorConfig } from "@coinbase/x402";

/** Circle official USDC contract addresses — https://developers.circle.com/stablecoins/usdc-contract-addresses */
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

export function getNetworkMode(): NetworkMode {
  const raw = (process.env.NETWORK ?? "sepolia").toLowerCase();
  return raw === "mainnet" ? "mainnet" : "sepolia";
}

export function getArbitrumChain(mode: NetworkMode = getNetworkMode()) {
  return mode === "mainnet" ? arbitrum : arbitrumSepolia;
}

export function getArbitrumCaip2(mode: NetworkMode = getNetworkMode()) {
  return mode === "mainnet" ? CAIP2.arbitrum : CAIP2.arbitrumSepolia;
}

export function getArbitrumUsdc(mode: NetworkMode = getNetworkMode()) {
  return mode === "mainnet" ? USDC_ADDRESSES.arbitrum : USDC_ADDRESSES.arbitrumSepolia;
}

export function getArbitrumRpcUrl(mode: NetworkMode = getNetworkMode()) {
  if (mode === "mainnet") {
    return process.env.ARBITRUM_MAINNET_RPC_URL ?? arbitrum.rpcUrls.default.http[0];
  }
  return process.env.ARBITRUM_RPC_URL ?? arbitrumSepolia.rpcUrls.default.http[0];
}

export function getBaseChain(mode: NetworkMode = getNetworkMode()) {
  return mode === "mainnet" ? base : baseSepolia;
}

export function getBaseCaip2(mode: NetworkMode = getNetworkMode()) {
  return mode === "mainnet" ? CAIP2.base : CAIP2.baseSepolia;
}

export function getFacilitatorUrl() {
  return process.env.CDP_FACILITATOR_URL ?? "https://api.cdp.coinbase.com/platform/v2/x402";
}

export function getExplorerTxUrl(txHash: string, network: string): string {
  if (network === CAIP2.arbitrum || network === "arbitrum") {
    return `https://arbiscan.io/tx/${txHash}`;
  }
  if (network === CAIP2.arbitrumSepolia) {
    return `https://sepolia.arbiscan.io/tx/${txHash}`;
  }
  if (network === CAIP2.base) {
    return `https://basescan.org/tx/${txHash}`;
  }
  if (network === CAIP2.baseSepolia) {
    return `https://sepolia.basescan.org/tx/${txHash}`;
  }
  return `https://arbiscan.io/tx/${txHash}`;
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
  const url = getFacilitatorUrl();

  if (keyId && keySecret) {
    return new HTTPFacilitatorClient(createFacilitatorConfig(keyId, keySecret));
  }

  return new HTTPFacilitatorClient({ url });
}
