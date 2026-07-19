import { buildHttpToolRequest } from "./http-tool-request.js";
import type { CatalogTool } from "./tool-catalog.js";
import type { ProbeHealth } from "./probe-health.js";
import { classifyProbeFailure } from "./vendor-errors.js";
import { probeQuote } from "../services/x402-client.js";

export type { ProbeHealth } from "./probe-health.js";

type McpPlanStep = {
  kind: string;
  estCostUsdc: number;
  mcpToolName?: string;
  proxyParameters?: Record<string, unknown>;
  probeHealth?: ProbeHealth;
  probeDetail?: string;
  probeHttpStatus?: number | null;
};

export interface ToolProbeOutcome {
  health: ProbeHealth;
  httpStatus: number | null;
  detail: string;
  probeUsdc: number | null;
  network: string | null;
}

/**
 * CDP buyer pattern: unpaid HTTP → expect 402 + payment requirements.
 * @see https://docs.cdp.coinbase.com/x402/support/troubleshooting
 */
export async function probeToolForPlan(
  tool: CatalogTool,
  proxyParameters: Record<string, unknown>,
): Promise<ToolProbeOutcome> {
  const endpoint = tool.resourceUrl ?? tool.httpResource;
  if (!endpoint) {
    return {
      health: "unverified",
      httpStatus: null,
      detail: "No HTTP URL — MCP proxy only (not preflight-tested at $0)",
      probeUsdc: tool.probeUsdc ?? tool.catalogUsdc,
      network: tool.network,
    };
  }

  const probeTool: CatalogTool = tool.resourceUrl ? tool : { ...tool, resourceUrl: endpoint };

  try {
    const { url, init } = buildHttpToolRequest(probeTool, proxyParameters);
    const quote = await probeQuote(url, init, tool.displayName);
    return {
      health: "ready",
      httpStatus: 402,
      detail: `Live 402 OK · ~$${quote.usdc.toFixed(4)} USDC`,
      probeUsdc: quote.usdc,
      network: quote.network,
    };
  } catch (err) {
    const classified = classifyProbeFailure(err);
    console.warn(
      `[tool-probe] ${tool.displayName}: ${classified.userMessage.slice(0, 120)}`,
    );
    return {
      health: "unavailable",
      httpStatus: classified.httpStatus,
      detail: classified.userMessage,
      probeUsdc: null,
      network: tool.network,
    };
  }
}

export function applyProbeToCatalogTool(
  tool: CatalogTool,
  outcome: ToolProbeOutcome,
): CatalogTool {
  return {
    ...tool,
    probeUsdc: outcome.probeUsdc ?? tool.probeUsdc,
    network: outcome.network ?? tool.network,
    probeHealth: outcome.health,
    probeDetail: outcome.detail,
    probeHttpStatus: outcome.httpStatus,
  };
}

export function applyProbeToPlanStep<T extends McpPlanStep>(step: T, outcome: ToolProbeOutcome): T {
  if (step.kind !== "mcp") return step;
  return {
    ...step,
    probeHealth: outcome.health,
    probeDetail: outcome.detail,
    probeHttpStatus: outcome.httpStatus,
    estCostUsdc: outcome.probeUsdc ?? step.estCostUsdc,
  };
}

/** Probe planner-selected MCP steps with final proxyParameters ($0). */
export async function probePlanSteps<T extends McpPlanStep>(
  mcpSteps: T[],
  catalog: CatalogTool[],
): Promise<{ steps: T[]; catalog: CatalogTool[] }> {
  const catalogMap = new Map(catalog.map((t) => [t.mcpToolName, { ...t }]));
  const probedSteps: T[] = [];

  for (const step of mcpSteps) {
    if (step.kind !== "mcp" || !step.mcpToolName) {
      probedSteps.push(step);
      continue;
    }

    const tool = catalogMap.get(step.mcpToolName);
    if (!tool) {
      probedSteps.push({
        ...step,
        probeHealth: "unverified",
        probeDetail: "Tool not in catalog",
      });
      continue;
    }

    const outcome = await probeToolForPlan(tool, step.proxyParameters ?? {});
    catalogMap.set(step.mcpToolName, applyProbeToCatalogTool(tool, outcome));
    probedSteps.push(applyProbeToPlanStep(step, outcome));
  }

  return { steps: probedSteps, catalog: [...catalogMap.values()] };
}

export function planHasBlockingProbeFailures(steps: McpPlanStep[]): boolean {
  return steps.some((s) => s.kind === "mcp" && s.probeHealth === "unavailable");
}
