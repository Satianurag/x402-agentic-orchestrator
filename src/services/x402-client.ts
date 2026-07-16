import { x402Client, x402HTTPClient } from "@x402/core/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import { ExactEvmScheme, toClientEvmSigner } from "@x402/evm";
import { decodePaymentResponseHeader } from "@x402/core/http";
import { createPublicClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";
import {
  CAIP2,
  getArbitrumCaip2,
  getArbitrumChain,
  getArbitrumRpcUrl,
  getBaseCaip2,
  getBaseChain,
  getNetworkMode,
  atomicToUsdc,
} from "../config/chains.js";
import type { BudgetGuard } from "../budget/guard.js";
import { BudgetOverflowError } from "../budget/guard.js";

export interface PaymentResult {
  usdc: number;
  txHash: string;
  explorerUrl: string;
  network: string;
  data: unknown;
}

function requirePrivateKey(): Hex {
  const key = process.env.PRIVATE_KEY;
  if (!key) throw new Error("PRIVATE_KEY required for x402 payments");
  return key as Hex;
}

export function createX402Fetch(budgetGuard?: BudgetGuard) {
  const account = privateKeyToAccount(requirePrivateKey());
  const mode = getNetworkMode();

  const baseClient = createPublicClient({
    chain: getBaseChain(mode),
    transport: http(),
  });
  const arbitrumClient = createPublicClient({
    chain: getArbitrumChain(mode),
    transport: http(getArbitrumRpcUrl(mode)),
  });

  const baseSigner = toClientEvmSigner(account, baseClient);
  const arbitrumSigner = toClientEvmSigner(account, arbitrumClient);

  const client = new x402Client()
    .register(getBaseCaip2(mode), new ExactEvmScheme(baseSigner))
    .register(CAIP2.base, new ExactEvmScheme(baseSigner))
    .register(getArbitrumCaip2(mode), new ExactEvmScheme(arbitrumSigner))
    .register(CAIP2.arbitrum, new ExactEvmScheme(arbitrumSigner));

  if (budgetGuard) {
    client.onBeforePaymentCreation(async (ctx) => {
      const amount = ctx.selectedRequirements.amount;
      const quoteUsdc = atomicToUsdc(amount);
      try {
        budgetGuard.preCheck(quoteUsdc);
      } catch (err) {
        if (err instanceof BudgetOverflowError) throw err;
        throw err;
      }
    });
  }

  const paidFetch = wrapFetchWithPayment(fetch, client);
  const httpClient = new x402HTTPClient(client);

  return { paidFetch, httpClient, client };
}

export async function paidRequest(
  url: string,
  init: RequestInit,
  budgetGuard: BudgetGuard,
  serviceName: string,
): Promise<PaymentResult> {
  const { paidFetch, httpClient } = createX402Fetch(budgetGuard);

  const response = await paidFetch(url, init);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${serviceName} failed (${response.status}): ${text}`);
  }

  let usdc = 0;
  let txHash = "";
  let network = "";

  const settle = httpClient.getPaymentSettleResponse((name) => response.headers.get(name));
  if (settle?.success) {
    usdc = atomicToUsdc(settle.amount ?? "0");
    txHash = settle.transaction ?? "";
    network = settle.network ?? "";
    budgetGuard.recordSpend(usdc);
  } else {
    const header = response.headers.get("payment-response") ?? response.headers.get("PAYMENT-RESPONSE");
    if (header) {
      try {
        const decoded = decodePaymentResponseHeader(header);
        if (decoded.success) {
          usdc = atomicToUsdc(decoded.amount ?? 0);
          txHash = decoded.transaction ?? "";
          network = decoded.network ?? "";
          budgetGuard.recordSpend(usdc);
        }
      } catch {
        // estimate from pricing if no receipt
        usdc = 0.01;
      }
    }
  }

  const data = await response.json();
  const { getExplorerTxUrl } = await import("../config/chains.js");

  console.log(`[x402] ${serviceName} paid ${usdc.toFixed(6)} USDC tx=${txHash}`);

  return {
    usdc,
    txHash,
    explorerUrl: txHash ? getExplorerTxUrl(txHash, network) : "",
    network,
    data,
  };
}

/** Probe a 402 quote without paying (for plan estimates). */
export async function probeQuoteUsdc(url: string, init: RequestInit): Promise<number> {
  const res = await fetch(url, init);
  if (res.status !== 402) return 0;
  const header = res.headers.get("payment-required") ?? res.headers.get("PAYMENT-REQUIRED");
  if (!header) return 0.01;
  try {
    const json = JSON.parse(Buffer.from(header, "base64").toString("utf8"));
    const amount = json.accepts?.[0]?.amount;
    if (amount) return atomicToUsdc(amount);
  } catch {
    return 0.01;
  }
  return 0.01;
}
