import { createPublicClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { USDC_ADDRESSES, getBaseRpcUrl, getPaymentChain } from "../config/chains.js";

const ERC20_BALANCE_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

function requirePrivateKey(): Hex {
  const key = process.env.PRIVATE_KEY;
  if (!key) throw new Error("PRIVATE_KEY required");
  return key as Hex;
}

/** Run-wallet EOA — same address that signs x402 payments on Base. */
export function getRunEoaAddress(): `0x${string}` {
  return privateKeyToAccount(requirePrivateKey()).address;
}

export function getRunEoaAccount() {
  return privateKeyToAccount(requirePrivateKey());
}

export async function getEoaBaseUsdcBalance(): Promise<bigint> {
  const client = createPublicClient({
    chain: getPaymentChain(),
    transport: http(getBaseRpcUrl()),
  });
  return client.readContract({
    address: USDC_ADDRESSES.base,
    abi: ERC20_BALANCE_ABI,
    functionName: "balanceOf",
    args: [getRunEoaAddress()],
  });
}
