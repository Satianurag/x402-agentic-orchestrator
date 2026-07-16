import { x402Client, x402HTTPClient } from "@x402/core/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import {
  decodePaymentRequiredHeader,
  decodePaymentResponseHeader,
} from "@x402/core/http";
import {
  CAIP2,
  atomicToUsdc,
  getExplorerTxUrl,
  getPaymentCaip2,
  getSellerCaip2,
} from "../config/chains.js";
import { getRunEoaAccount } from "../wallet/eoa.js";
import type { BudgetGuard } from "../budget/guard.js";

export interface PaymentResult {
  usdc: number;
  txHash: string;
  explorerUrl: string;
  network: string;
  data: unknown;
}

function paymentHeader(res: Response, name: string): string | null {
  return res.headers.get(name) ?? res.headers.get(name.toUpperCase());
}

export function createX402Fetch(budgetGuard?: BudgetGuard) {
  const account = getRunEoaAccount();

  const client = new x402Client();
  registerExactEvmScheme(client, { signer: account, networks: [getPaymentCaip2(), CAIP2.base] });
  registerExactEvmScheme(client, { signer: account, networks: [getSellerCaip2(), CAIP2.arbitrum] });

  if (budgetGuard) {
    client.onBeforePaymentCreation(async (ctx) => {
      const quoteUsdc = atomicToUsdc(ctx.selectedRequirements.amount);
      await budgetGuard.preCheck(quoteUsdc);
    });
  }

  return {
    paidFetch: wrapFetchWithPayment(fetch, client),
    httpClient: new x402HTTPClient(client),
  };
}

function extractSettlement(
  response: Response,
  httpClient: x402HTTPClient,
): { usdc: number; txHash: string; network: string } {
  const settle = httpClient.getPaymentSettleResponse((name) => paymentHeader(response, name));
  if (settle?.success && settle.transaction) {
    return {
      usdc: atomicToUsdc(settle.amount ?? "0"),
      txHash: settle.transaction,
      network: settle.network,
    };
  }

  const header = paymentHeader(response, "payment-response");
  if (!header) {
    throw new Error("Paid response missing PAYMENT-RESPONSE settlement header");
  }

  const decoded = decodePaymentResponseHeader(header);
  if (!decoded.success || !decoded.transaction) {
    throw new Error(`Payment settlement failed: ${decoded.errorReason ?? "unknown"}`);
  }

  return {
    usdc: atomicToUsdc(decoded.amount ?? "0"),
    txHash: decoded.transaction,
    network: decoded.network,
  };
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

  const { usdc, txHash, network } = extractSettlement(response, httpClient);
  budgetGuard.recordSpend(usdc);

  const data = await response.json();
  console.log(`[x402] ${serviceName} paid ${usdc.toFixed(6)} USDC tx=${txHash}`);

  return {
    usdc,
    txHash,
    explorerUrl: getExplorerTxUrl(txHash, network),
    network,
    data,
  };
}

/** Probe live 402 quote — throws if no payment requirements returned. */
export async function probeQuoteUsdc(url: string, init: RequestInit): Promise<number> {
  const res = await fetch(url, init);
  if (res.status !== 402) {
    throw new Error(`Expected HTTP 402 from ${url}, got ${res.status}`);
  }

  const header = paymentHeader(res, "payment-required");
  if (!header) {
    throw new Error(`402 response from ${url} missing PAYMENT-REQUIRED header`);
  }

  const required = decodePaymentRequiredHeader(header);
  const amount = required.accepts[0]?.amount;
  if (!amount) {
    throw new Error(`402 response from ${url} has no price in accepts[0].amount`);
  }

  return atomicToUsdc(amount);
}
