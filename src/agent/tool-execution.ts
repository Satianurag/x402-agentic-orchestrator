import { mcpProxyToolCall, type BazaarMcpSession } from "./bazaar-mcp.js";
import { buildHttpToolRequest } from "./http-tool-request.js";
import type { CatalogTool } from "./tool-catalog.js";
import type { PlanStep } from "./plan.js";
import { paidRequest, type PaymentResult } from "../services/x402-client.js";
import type { BudgetGuard } from "../budget/guard.js";

const VERIFY_FAILURE_RE = /x402_verify_failed|payment signature could not be verified|invalid_exact_evm_payload_signature/i;

export function isPaymentVerifyFailure(message: string): boolean {
  return VERIFY_FAILURE_RE.test(message);
}

/**
 * Production buyer path (CDP docs): pay via live HTTP 402 on canonical resource URL.
 * Falls back to Bazaar MCP proxy so existing tools keep working when HTTP is unavailable.
 */
export async function executePaidToolStep(
  step: PlanStep,
  tool: CatalogTool | undefined,
  mcpSession: BazaarMcpSession | undefined,
  guard: BudgetGuard,
): Promise<PaymentResult> {
  if (!step.mcpToolName) {
    throw new Error(`Paid step "${step.label}" is missing mcpToolName`);
  }

  const proxyArgs = step.proxyParameters ?? {};
  const canHttp = Boolean(tool?.resourceUrl);

  if (canHttp && tool) {
    try {
      const { url, init } = buildHttpToolRequest(tool, proxyArgs);
      console.log(`[x402-http] ${step.label}: live 402 → ${url}`);
      return await paidRequest(url, init, guard, step.label);
    } catch (httpErr) {
      const httpMessage = httpErr instanceof Error ? httpErr.message : String(httpErr);
      console.warn(`[x402-http] ${step.label} failed (${httpMessage.slice(0, 160)}) — trying MCP proxy`);
    }
  }

  if (!mcpSession) {
    throw new Error("MCP session required for Bazaar tool execution");
  }

  try {
    return await mcpProxyToolCall(
      mcpSession,
      step.mcpToolName,
      proxyArgs,
      step.label,
    );
  } catch (mcpErr) {
    const mcpMessage = mcpErr instanceof Error ? mcpErr.message : String(mcpErr);

    // Stale Bazaar index: MCP verify fails but live HTTP 402 often still works (Alephant-class).
    if (canHttp && tool && isPaymentVerifyFailure(mcpMessage)) {
      console.warn(
        `[x402-mcp] ${step.label}: verify failed on MCP proxy — retrying live HTTP`,
      );
      const { url, init } = buildHttpToolRequest(tool, proxyArgs);
      return paidRequest(url, init, guard, step.label);
    }

    throw mcpErr;
  }
}
