import { createPublicClient, http } from "viem";
import { x402Client, x402HTTPClient } from "@x402/core/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { toClientEvmSigner } from "@x402/evm";
import {
  decodePaymentRequiredHeader,
  decodePaymentResponseHeader,
} from "@x402/core/http";
import {
  atomicToUsdc,
  getBaseRpcUrl,
  getExplorerTxUrl,
  getPaymentCaip2,
  getPaymentChain,
  getSellerCaip2,
  getSellerRpcUrl,
} from "../config/chains.js";
import { getRunContext } from "../wallet/run-context.js";
import { getRunEoaAccount } from "../wallet/eoa.js";
import { requestDelegatedSignTypedData } from "../wallet/sign-bridge.js";
import type { BudgetGuard } from "../budget/guard.js";

export interface PaymentResult {
  usdc: number;
  txHash: string;
  explorerUrl: string;
  network: string;
  data: unknown;
}

/**
 * Spend amount for a settled payment (exact scheme).
 *
 * `SettleResponse.amount` is optional — mainly for `upto` where charge can differ from the
 * authorized max. Official x402 lifecycle hooks record `requirements.amount` (same as
 * `paymentPayload.accepted.amount`), not settle.amount.
 *
 * @see SettleResponse.amount JSDoc in @x402/core
 * @see https://github.com/coinbase/x402/blob/main/docs/advanced-concepts/lifecycle-hooks.mdx
 */
export function settledSpendUsdc(
  settleAmount: string | undefined,
  authorizedAmountAtomic: string | undefined,
): number {
  const raw =
    settleAmount != null && settleAmount !== ""
      ? settleAmount
      : authorizedAmountAtomic;
  if (raw == null || raw === "") return 0;
  return atomicToUsdc(raw);
}

function paymentHeader(res: Response, name: string): string | null {
  return res.headers.get(name) ?? res.headers.get(name.toUpperCase());
}

function createPaymentSigner() {
  const { signer } = getRunContext();
  if (signer.mode === "cli") {
    const account = getRunEoaAccount();
    const publicClient = createPublicClient({
      chain: getPaymentChain(),
      transport: http(getBaseRpcUrl()),
    });
    return toClientEvmSigner(account, publicClient);
  }

  return {
    address: signer.address,
    signTypedData: requestDelegatedSignTypedData,
  };
}

export function createX402PaymentClient(budgetGuard?: BudgetGuard) {
  const paymentCaip2 = getPaymentCaip2();
  const sellerCaip2 = getSellerCaip2();
  const evmSigner = createPaymentSigner();

  const client = new x402Client();
  registerExactEvmScheme(client, {
    signer: evmSigner,
    networks: [paymentCaip2],
    schemeOptions: { rpcUrl: getBaseRpcUrl() },
  });
  registerExactEvmScheme(client, {
    signer: evmSigner,
    networks: [sellerCaip2],
    schemeOptions: { rpcUrl: getSellerRpcUrl() },
  });

  if (budgetGuard) {
    client.onBeforePaymentCreation(async (ctx) => {
      const quoteUsdc = atomicToUsdc(ctx.selectedRequirements.amount);
      await budgetGuard.preCheck(quoteUsdc, ctx.selectedRequirements.network);
    });
  }

  return client;
}

export function createX402Fetch(budgetGuard?: BudgetGuard) {
  const client = createX402PaymentClient(budgetGuard);
  /** Signed exact-scheme amount from PaymentPayload.accepted (requirements.amount). */
  let authorizedAmountAtomic: string | undefined;
  client.onAfterPaymentCreation(async (ctx) => {
    authorizedAmountAtomic = ctx.paymentPayload.accepted.amount;
  });

  return {
    paidFetch: wrapFetchWithPayment(fetch, client),
    httpClient: new x402HTTPClient(client),
    getAuthorizedAmountAtomic: () => authorizedAmountAtomic,
  };
}

function extractSettlement(
  response: Response,
  httpClient: x402HTTPClient,
  authorizedAmountAtomic?: string,
): { usdc: number; txHash: string; network: string } {
  const settle = httpClient.getPaymentSettleResponse((name) => paymentHeader(response, name));
  if (settle?.success && settle.transaction) {
    return {
      usdc: settledSpendUsdc(settle.amount, authorizedAmountAtomic),
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
    usdc: settledSpendUsdc(decoded.amount, authorizedAmountAtomic),
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
  const { paidFetch, httpClient, getAuthorizedAmountAtomic } = createX402Fetch(budgetGuard);
  const response = await paidFetch(url, init);

  if (response.status === 402) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `${serviceName} payment rejected (402): ${text || "empty body — check Base USDC balance / signature"}`,
    );
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${serviceName} failed (${response.status}): ${text}`);
  }

  const { usdc, txHash, network } = extractSettlement(
    response,
    httpClient,
    getAuthorizedAmountAtomic(),
  );
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

export interface ProbeQuote {
  usdc: number;
  network: string;
}

/** Probe live 402 quote — throws if no payment requirements returned. */
export async function probeQuote(
  url: string,
  init: RequestInit,
  endpointLabel = url,
): Promise<ProbeQuote> {
  const res = await fetch(url, init);
  if (res.status !== 402) {
    throw new Error(`Expected HTTP 402 from ${endpointLabel}, got ${res.status}`);
  }

  const getHeader = (name: string) => paymentHeader(res, name);
  const header = getHeader("payment-required");
  let required;
  if (header) {
    required = decodePaymentRequiredHeader(header);
  } else {
    const contentType = res.headers.get("content-type") ?? "";
    const body = contentType.includes("application/json") ? await res.json() : undefined;
    const httpClient = new x402HTTPClient(new x402Client());
    required = httpClient.getPaymentRequiredResponse(getHeader, body);
  }

  const accept = required.accepts[0];
  const amount =
    accept?.amount ??
    (accept as { maxAmountRequired?: string } | undefined)?.maxAmountRequired;
  if (!amount) {
    throw new Error(`402 response from ${endpointLabel} has no price in accepts[0]`);
  }

  return {
    usdc: atomicToUsdc(amount),
    network: accept.network ?? "unknown",
  };
}

export async function probeQuoteUsdc(
  url: string,
  init: RequestInit,
  endpointLabel?: string,
): Promise<number> {
  const quote = await probeQuote(url, init, endpointLabel);
  return quote.usdc;
}
