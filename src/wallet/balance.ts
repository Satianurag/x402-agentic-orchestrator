import { createPublicClient, http, type Chain } from "viem";
import {
  atomicToUsdc,
  getBaseRpcUrl,
  getPaymentChain,
  getPaymentUsdc,
  getSellerChain,
  getSellerRpcUrl,
  getSellerUsdc,
} from "../config/chains.js";
import { UniversalAccountWallet } from "./ua.js";
import type { RunSigner } from "./signer.js";

const ERC20_BALANCE_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

async function readUsdcBalance(
  address: `0x${string}`,
  chain: Chain,
  rpcUrl: string,
  usdcAddress: `0x${string}`,
): Promise<number> {
  const client = createPublicClient({ chain, transport: http(rpcUrl) });
  const raw = await client.readContract({
    address: usdcAddress,
    abi: ERC20_BALANCE_ABI,
    functionName: "balanceOf",
    args: [address],
  });
  return atomicToUsdc(raw);
}

export interface WalletBalances {
  eoaAddress: string;
  baseUsdc: number;
  arbitrumUsdc: number;
  uaUnifiedUsdc: number | null;
  uaError?: string;
}

export async function getWalletBalances(
  eoaAddress: `0x${string}`,
  signer: RunSigner,
): Promise<WalletBalances> {
  const [baseUsdc, arbitrumUsdc] = await Promise.all([
    readUsdcBalance(eoaAddress, getPaymentChain(), getBaseRpcUrl(), getPaymentUsdc()),
    readUsdcBalance(eoaAddress, getSellerChain(), getSellerRpcUrl(), getSellerUsdc()),
  ]);

  let uaUnifiedUsdc: number | null = null;
  let uaError: string | undefined;
  try {
    const ua = new UniversalAccountWallet(signer);
    uaUnifiedUsdc = await ua.getUnifiedUsdcBalance();
  } catch (err) {
    uaError = err instanceof Error ? err.message : String(err);
  }

  return { eoaAddress, baseUsdc, arbitrumUsdc, uaUnifiedUsdc, uaError };
}
