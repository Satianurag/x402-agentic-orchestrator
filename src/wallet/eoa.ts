import { createPublicClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getBaseRpcUrl, getPaymentChain, getPaymentUsdc } from "../config/chains.js";
import { getRunContext } from "./run-context.js";

const ERC20_BALANCE_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export function getRunEoaAccountFromKey(privateKey: Hex) {
  return privateKeyToAccount(privateKey);
}

function requirePrivateKey(): Hex {
  const key = process.env.PRIVATE_KEY;
  if (!key) throw new Error("PRIVATE_KEY required for CLI runs");
  return key as Hex;
}

/** Active run-wallet EOA — from run context (CLI private key or Magic address). */
export function getRunEoaAddress(): `0x${string}` {
  return getRunContext().eoaAddress;
}

export function getRunEoaAccount() {
  const ctx = getRunContext();
  if (ctx.signer.mode !== "cli") {
    throw new Error("getRunEoaAccount() is CLI-only — UI runs use Magic delegated signing");
  }
  return getRunEoaAccountFromKey(requirePrivateKey());
}

export async function getEoaBaseUsdcBalance(): Promise<bigint> {
  const client = createPublicClient({
    chain: getPaymentChain(),
    transport: http(getBaseRpcUrl()),
  });
  return client.readContract({
    address: getPaymentUsdc(),
    abi: ERC20_BALANCE_ABI,
    functionName: "balanceOf",
    args: [getRunEoaAddress()],
  });
}
