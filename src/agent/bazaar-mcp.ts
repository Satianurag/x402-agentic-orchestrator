import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { parsePaymentRequired } from "@x402/core/schemas";
import type { PaymentPayload, PaymentRequired } from "@x402/core/types";
import { wrapMCPClientWithPayment, type x402MCPToolCallResult } from "@x402/mcp";
import { getExplorerTxUrl, getPaymentCaip2, atomicToUsdc } from "../config/chains.js";
import {
  createX402PaymentClient,
  settledSpendUsdc,
  type PaymentResult,
} from "../services/x402-client.js";
import type { BudgetGuard } from "../budget/guard.js";

/** CDP Bazaar MCP — https://docs.cdp.coinbase.com/x402/bazaar */
export const CDP_BAZAAR_MCP_URL = "https://api.cdp.coinbase.com/platform/v2/x402/discovery/mcp";

/** MCP transport v2 — CDP Bazaar puts PaymentRequired here (not in content JSON). */
const MCP_PAYMENT_REQUIRED_META_KEY = "x402/payment-required";

export type BazaarMcpSession = ReturnType<typeof wrapMCPClientWithPayment>;

export interface BazaarMcpSessionOptions {
  /** Discovered Bazaar tool names approved in the plan (proxy_tool_call toolName). */
  allowedToolNames?: Set<string>;
}

/**
 * Semantic discovery via Bazaar MCP `search_resources` (no payment).
 * @see https://docs.cdp.coinbase.com/x402/bazaar — Bazaar MCP Server
 */
export async function mcpSearchResources(query: string): Promise<unknown> {
  const client = new Client({ name: "x402-agentic-orchestrator", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(CDP_BAZAAR_MCP_URL));
  await client.connect(transport);
  try {
    return await client.callTool({ name: "search_resources", arguments: { query } });
  } finally {
    await client.close();
  }
}

/**
 * Paid Bazaar MCP session — `wrapMCPClientWithPayment` + delegated signing from run context.
 * Buy-gate: official `onPaymentRequested` (return false to deny).
 * @see https://docs.cdp.coinbase.com/x402/bazaar
 * @see https://github.com/coinbase/x402/blob/main/typescript/packages/mcp/README.md
 */
export async function createBazaarMcpSession(
  budgetGuard: BudgetGuard,
  options: BazaarMcpSessionOptions = {},
): Promise<BazaarMcpSession> {
  const mcpClient = new Client({ name: "x402-agentic-orchestrator", version: "1.0.0" });
  const paymentClient = createX402PaymentClient(budgetGuard);
  const allowed = options.allowedToolNames;

  const session = wrapMCPClientWithPayment(mcpClient, paymentClient, {
    autoPayment: true,
    onPaymentRequested: async (ctx) => {
      const discovered =
        typeof ctx.arguments?.toolName === "string" ? ctx.arguments.toolName : undefined;
      if (allowed && allowed.size > 0) {
        const ok =
          (discovered && allowed.has(discovered)) ||
          allowed.has(ctx.toolName);
        if (!ok) {
          console.warn(
            `[x402-mcp] deny payment — not in plan: ${discovered ?? ctx.toolName}`,
          );
          return false;
        }
      }

      const amount = ctx.paymentRequired.accepts[0]?.amount;
      if (!amount) {
        console.warn("[x402-mcp] deny payment — missing accepts[0].amount");
        return false;
      }
      const usdc = atomicToUsdc(amount);
      const remaining = await budgetGuard.getRemaining();
      if (usdc > remaining + 1e-9) {
        console.warn(
          `[x402-mcp] deny payment $${usdc.toFixed(6)} > remaining $${remaining.toFixed(6)}`,
        );
        return false;
      }
      return true;
    },
  });

  // Exact scheme: record authorized requirements.amount (paymentPayload.accepted).
  session.onAfterPayment(({ settleResponse, paymentPayload }) => {
    if (settleResponse?.success && settleResponse.transaction) {
      budgetGuard.recordSpend(
        settledSpendUsdc(settleResponse.amount, paymentPayload?.accepted?.amount),
      );
    }
  });

  await session.connect(new StreamableHTTPClientTransport(new URL(CDP_BAZAAR_MCP_URL)));
  return session;
}

/**
 * Bazaar `proxy_tool_call` schema is strict:
 * `{ toolName: string, parameters?: { query?, body?, headers? } }` with additionalProperties: false.
 *
 * Discovered tool schemas say: pass tool args inside `parameters`, using `query` (GET) or `body` (POST).
 * Planner output is often flat (`{ question }`) or wrongly shaped — normalize here.
 * @see https://docs.cdp.coinbase.com/x402/bazaar
 */
function normalizeProxyArgs(
  toolName: string,
  proxyArgs: Record<string, unknown>,
): { toolName: string; parameters: Record<string, unknown> } {
  const nested = proxyArgs.parameters;
  let raw: Record<string, unknown>;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    raw = { ...(nested as Record<string, unknown>) };
  } else {
    raw = {};
    for (const [key, value] of Object.entries(proxyArgs)) {
      if (key === "toolName" || key === "parameters") continue;
      raw[key] = value;
    }
  }

  // Already in Bazaar wire format.
  if (raw.body !== undefined || raw.query !== undefined || raw.headers !== undefined) {
    const parameters: Record<string, unknown> = {};
    if (raw.body !== undefined) parameters.body = raw.body;
    if (raw.query !== undefined) parameters.query = raw.query;
    if (raw.headers !== undefined) parameters.headers = raw.headers;
    return { toolName, parameters };
  }

  const isGet = toolName.startsWith("x402_get_");
  if (isGet) {
    return { toolName, parameters: Object.keys(raw).length ? { query: raw } : {} };
  }

  // POST / other: wrap flat fields as JSON body.
  return { toolName, parameters: Object.keys(raw).length ? { body: raw } : { body: {} } };
}

function preferPaymentNetwork(accepts: PaymentRequired["accepts"]): PaymentRequired["accepts"] {
  const paymentNetwork = getPaymentCaip2();
  const matching = accepts.filter((a) => a.network === paymentNetwork);
  return matching.length > 0 ? matching : accepts;
}

/**
 * CDP Bazaar often omits `resource` from `_meta["x402/payment-required"]`.
 * `@x402/core` parsePaymentRequired requires it — inject a synthetic resource URL.
 * @see https://github.com/coinbase/x402/blob/main/specs/transports-v2/mcp.md
 */
function coercePaymentRequired(
  candidate: unknown,
  toolName: string,
): PaymentRequired | null {
  if (!candidate || typeof candidate !== "object") return null;

  const raw = candidate as Record<string, unknown>;
  const withResource =
    raw.resource && typeof raw.resource === "object"
      ? raw
      : {
          ...raw,
          resource: {
            url: `mcp://tool/${toolName}`,
            description: toolName,
            mimeType: "application/json",
          },
        };

  const parsed = parsePaymentRequired(withResource);
  if (!parsed.success) return null;

  const data = parsed.data as PaymentRequired;
  return {
    ...data,
    accepts: preferPaymentNetwork(data.accepts),
  };
}

function extractPaymentRequiredFromMeta(
  meta: Record<string, unknown> | undefined,
  toolName: string,
): PaymentRequired | null {
  return coercePaymentRequired(meta?.[MCP_PAYMENT_REQUIRED_META_KEY], toolName);
}

/** Corrective 402 after a rejected payment often arrives as JSON in content[0].text. */
function extractPaymentRequiredFromContent(
  content: x402MCPToolCallResult["content"] | unknown,
  toolName: string,
): PaymentRequired | null {
  if (!Array.isArray(content) || content.length === 0) return null;
  const first = content[0];
  if (!first || typeof first !== "object") return null;
  if (!("type" in first) || first.type !== "text" || !("text" in first)) return null;
  if (typeof first.text !== "string") return null;

  try {
    const parsed = JSON.parse(first.text) as unknown;
    return coercePaymentRequired(parsed, toolName);
  } catch {
    return null;
  }
}

function formatMcpToolError(content: x402MCPToolCallResult["content"]): string {
  return (
    content
      ?.map((c) => (c.type === "text" && "text" in c ? c.text : ""))
      .join("")
      .trim() || "unknown error"
  );
}

function parseMcpToolData(content: x402MCPToolCallResult["content"]): unknown {
  const textItem = content?.find((c) => c.type === "text" && "text" in c);
  if (textItem && "text" in textItem && typeof textItem.text === "string") {
    try {
      return JSON.parse(textItem.text);
    } catch {
      return textItem.text;
    }
  }
  return content;
}

function paymentResultFromMcpCall(
  result: x402MCPToolCallResult,
  serviceName: string,
  /** Signed PaymentPayload.accepted.amount — source of truth for exact-scheme spend. */
  authorizedAmountAtomic?: string,
): PaymentResult {
  const settle = result.paymentResponse;
  const paid = Boolean(settle?.success || result.paymentMade);
  const usdc = paid ? settledSpendUsdc(settle?.amount, authorizedAmountAtomic) : 0;
  const txHash = settle?.transaction ?? "";
  const network = settle?.network ?? "unknown";

  if (result.paymentMade) {
    console.log(`[x402-mcp] ${serviceName} paid ${usdc.toFixed(6)} USDC tx=${txHash}`);
  }

  return {
    usdc,
    txHash,
    explorerUrl: txHash ? getExplorerTxUrl(txHash, network) : "",
    network,
    data: parseMcpToolData(result.content),
  };
}

async function payAndCall(
  session: BazaarMcpSession,
  args: { toolName: string; parameters: Record<string, unknown> },
  paymentRequired: PaymentRequired,
  serviceName: string,
): Promise<{ result: x402MCPToolCallResult; authorizedAmountAtomic: string }> {
  const amount = paymentRequired.accepts[0]?.amount ?? "?";
  const network = paymentRequired.accepts[0]?.network ?? "?";
  console.log(
    `[x402-mcp] ${serviceName}: creating payment amount=${amount} network=${network}`,
  );

  const paymentPayload: PaymentPayload =
    await session.paymentClient.createPaymentPayload(paymentRequired);
  const result = await session.callToolWithPayment("proxy_tool_call", args, paymentPayload);
  return { result, authorizedAmountAtomic: paymentPayload.accepted.amount };
}

/**
 * Invoke a discovered Bazaar resource via `proxy_tool_call`.
 *
 * CDP Bazaar (2026) returns PaymentRequired in `_meta["x402/payment-required"]`, often
 * without `resource`, and catalog amounts can disagree with the live endpoint. Official
 * `@x402/mcp` autoPayment only parses content JSON, so we:
 * 1. Read `_meta`, inject resource, filter to our payment network
 * 2. Sign + retry with `_meta["x402/payment"]`
 * 3. If facilitator rejects with a corrective PaymentRequired in content, pay again once
 *
 * @see https://docs.cdp.coinbase.com/x402/bazaar
 * @see https://github.com/coinbase/x402/blob/main/specs/transports-v2/mcp.md
 */
export async function mcpProxyToolCall(
  session: BazaarMcpSession,
  toolName: string,
  proxyArgs: Record<string, unknown>,
  serviceName: string,
): Promise<PaymentResult> {
  const args = normalizeProxyArgs(toolName, proxyArgs);
  console.log(
    `[x402-mcp] ${serviceName}: proxy_tool_call toolName=${toolName} parameters=${JSON.stringify(args.parameters).slice(0, 300)}`,
  );

  const raw = await session.client.callTool({ name: "proxy_tool_call", arguments: args });

  if (!raw.isError) {
    return paymentResultFromMcpCall(
      {
        content: raw.content as x402MCPToolCallResult["content"],
        isError: false,
        paymentMade: false,
      },
      serviceName,
    );
  }

  let paymentRequired =
    extractPaymentRequiredFromMeta(raw._meta as Record<string, unknown> | undefined, toolName) ??
    extractPaymentRequiredFromContent(raw.content, toolName);

  if (!paymentRequired) {
    throw new Error(
      `${serviceName} MCP proxy failed: ${formatMcpToolError(raw.content as x402MCPToolCallResult["content"])}`,
    );
  }

  let paid = await payAndCall(session, args, paymentRequired, serviceName);

  if (paid.result.isError) {
    const corrective = extractPaymentRequiredFromContent(paid.result.content, toolName);
    if (corrective) {
      const prev = paymentRequired.accepts[0]?.amount;
      const next = corrective.accepts[0]?.amount;
      console.log(
        `[x402-mcp] ${serviceName}: corrective payment required (${prev} → ${next}), retrying`,
      );
      paid = await payAndCall(session, args, corrective, serviceName);
    }
  }

  if (paid.result.isError) {
    throw new Error(`${serviceName} MCP proxy failed: ${formatMcpToolError(paid.result.content)}`);
  }

  return paymentResultFromMcpCall(paid.result, serviceName, paid.authorizedAmountAtomic);
}
