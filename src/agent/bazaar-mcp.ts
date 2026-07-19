import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { wrapMCPClientWithPayment } from "@x402/mcp";
import { atomicToUsdc, getExplorerTxUrl } from "../config/chains.js";
import { createX402PaymentClient, type PaymentResult } from "../services/x402-client.js";
import type { BudgetGuard } from "../budget/guard.js";

/** CDP Bazaar MCP — https://docs.cdp.coinbase.com/x402/bazaar */
export const CDP_BAZAAR_MCP_URL = "https://api.cdp.coinbase.com/platform/v2/x402/discovery/mcp";

export type BazaarMcpSession = ReturnType<typeof wrapMCPClientWithPayment>;

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
 * Use `proxy_tool_call` via {@link mcpProxyToolCall}.
 */
export async function createBazaarMcpSession(budgetGuard: BudgetGuard): Promise<BazaarMcpSession> {
  const mcpClient = new Client({ name: "x402-agentic-orchestrator", version: "1.0.0" });
  const paymentClient = createX402PaymentClient(budgetGuard);
  const session = wrapMCPClientWithPayment(mcpClient, paymentClient, { autoPayment: true });

  session.onAfterPayment(({ settleResponse }) => {
    if (settleResponse?.success && settleResponse.transaction) {
      budgetGuard.recordSpend(atomicToUsdc(settleResponse.amount ?? "0"));
    }
  });

  await session.connect(new StreamableHTTPClientTransport(new URL(CDP_BAZAAR_MCP_URL)));
  return session;
}

/**
 * Invoke a discovered Bazaar resource via `proxy_tool_call` (payment handled by @x402/mcp).
 * @see https://docs.cdp.coinbase.com/x402/bazaar — do not call discovered tools directly
 */
export async function mcpProxyToolCall(
  session: BazaarMcpSession,
  toolName: string,
  proxyArgs: Record<string, unknown>,
  serviceName: string,
): Promise<PaymentResult> {
  const result = await session.callTool("proxy_tool_call", {
    toolName,
    ...proxyArgs,
  });

  if (result.isError) {
    const errText =
      result.content
        ?.map((c) => (c.type === "text" && "text" in c ? c.text : ""))
        .join("")
        .trim() || "unknown error";
    throw new Error(`${serviceName} MCP proxy failed: ${errText}`);
  }

  const settle = result.paymentResponse;
  const usdc = settle?.success ? atomicToUsdc(settle.amount ?? "0") : 0;
  const txHash = settle?.transaction ?? "";
  const network = settle?.network ?? "unknown";

  let data: unknown = result.content;
  const textItem = result.content?.find((c) => c.type === "text" && "text" in c);
  if (textItem && "text" in textItem && typeof textItem.text === "string") {
    try {
      data = JSON.parse(textItem.text);
    } catch {
      data = textItem.text;
    }
  }

  if (result.paymentMade) {
    console.log(`[x402-mcp] ${serviceName} paid ${usdc.toFixed(6)} USDC tx=${txHash}`);
  }

  return {
    usdc,
    txHash,
    explorerUrl: txHash ? getExplorerTxUrl(txHash, network) : "",
    network,
    data,
  };
}
