import type { CatalogTool } from "./tool-catalog.js";

/**
 * Build a live HTTP request for a Bazaar HTTP tool.
 * Uses canonical discovery `resourceUrl` and planner `proxyParameters` wire shape.
 */
export function buildHttpToolRequest(
  tool: CatalogTool,
  proxyParameters: Record<string, unknown>,
): { url: string; init: RequestInit } {
  const url = tool.resourceUrl;
  if (!url) {
    throw new Error(`No canonical resource URL for tool ${tool.mcpToolName}`);
  }

  const method = tool.httpMethod ?? "POST";

  if (method === "GET") {
    const u = new URL(url);
    const query =
      (proxyParameters.query as Record<string, unknown> | undefined) ??
      extractFlatParams(proxyParameters);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) {
        u.searchParams.set(key, String(value));
      }
    }
    return { url: u.toString(), init: { method: "GET" } };
  }

  const body =
    (proxyParameters.body as Record<string, unknown> | undefined) ??
    extractFlatParams(proxyParameters);

  return {
    url,
    init: {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  };
}

function extractFlatParams(proxyParameters: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(proxyParameters)) {
    if (key === "parameters" || key === "query" || key === "body" || key === "headers") continue;
    out[key] = value;
  }
  return out;
}
