import { atomicToUsdc, getPaymentCaip2 } from "../config/chains.js";
import { probeQuote } from "../services/x402-client.js";
import { mcpSearchResources } from "./bazaar-mcp.js";
import {
  matchDiscoveryResourceUrl,
  searchDiscoveryResources,
  type DiscoveryResource,
} from "./discovery-search.js";

/** Tool entry from Bazaar MCP `search_resources` (CDP discovery catalog). */
export interface CatalogTool {
  mcpToolName: string;
  displayName: string;
  description: string;
  catalogUsdc: number | null;
  probeUsdc: number | null;
  network: string | null;
  payers30d: number | null;
  calls30d: number | null;
  inputSchema?: Record<string, unknown>;
  httpResource: string | null;
  /** Canonical HTTPS URL from CDP /discovery/search (preferred for live 402 payment). */
  resourceUrl: string | null;
  /** Seller payTo on the payment network — used to match discovery rows. */
  catalogPayTo: string | null;
  /** HTTP method from Bazaar extension (GET/POST). */
  httpMethod: "GET" | "POST" | null;
  /** Example body/query from Bazaar discovery extension. */
  exampleInput: Record<string, unknown> | null;
  curated: boolean;
}

type McpToolRaw = {
  name?: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  _meta?: {
    "x402/payment-required"?: {
      accepts?: Array<{ amount?: string; network?: string; payTo?: string }>;
      extensions?: {
        bazaar?: {
          info?: {
            input?: {
              type?: string;
              method?: string;
              body?: Record<string, unknown>;
              queryParams?: Record<string, unknown>;
            };
          };
        };
      };
    };
    "x402/guidance"?: { costObservedUsd?: string };
    "x402/curation"?: { curated?: boolean };
  };
};

function displayNameFromTool(tool: McpToolRaw): string {
  const desc = tool.description ?? "";
  const dash = desc.indexOf(" — ");
  if (dash > 0) return desc.slice(0, dash).trim();
  const guide = desc.indexOf(" Guide:");
  if (guide > 0) return desc.slice(0, guide).trim();
  return (tool.name ?? "tool").replace(/^x402_(get|post)_https___/i, "").slice(0, 64);
}

function catalogUsdcFromTool(tool: McpToolRaw): number | null {
  const guidance = tool._meta?.["x402/guidance"]?.costObservedUsd;
  if (guidance) {
    const n = Number(guidance);
    if (Number.isFinite(n)) return n;
  }
  const amount = tool._meta?.["x402/payment-required"]?.accepts?.[0]?.amount;
  if (!amount) return null;
  try {
    return atomicToUsdc(amount);
  } catch {
    return null;
  }
}

function networkFromTool(tool: McpToolRaw): string | null {
  return tool._meta?.["x402/payment-required"]?.accepts?.[0]?.network ?? null;
}

function qualityFromDescription(desc: string): { payers: number | null; calls: number | null } {
  const m = desc.match(/(\d+) calls from (\d+) unique payers/i);
  if (!m) return { payers: null, calls: null };
  return { payers: Number(m[2]), calls: Number(m[1]) };
}

function payToFromTool(tool: McpToolRaw): string | null {
  const network = getPaymentCaip2();
  const accepts = tool._meta?.["x402/payment-required"]?.accepts ?? [];
  const match = accepts.find((a) => a.network === network);
  return match?.payTo ?? accepts[0]?.payTo ?? null;
}

function enrichToolsWithDiscovery(
  tools: CatalogTool[],
  discoveryRows: DiscoveryResource[],
): CatalogTool[] {
  if (discoveryRows.length === 0) return tools;

  return tools.map((tool) => {
    const resourceUrl = matchDiscoveryResourceUrl(
      tool.mcpToolName,
      tool.catalogPayTo,
      discoveryRows,
    );
    if (!resourceUrl) return tool;
    return { ...tool, resourceUrl };
  });
}

function httpResourceFromName(name: string): string | null {
  const m = name.match(/^x402_(get|post)_https___(.+?)_[a-f0-9]+_/i);
  if (!m) return null;
  const path = m[2].replace(/_/g, "/").replace(/\/+/g, (s, i) => (i === 0 ? s : "/"));
  return `https://${path}`;
}

function httpMethodFromTool(tool: McpToolRaw): "GET" | "POST" | null {
  const method = tool._meta?.["x402/payment-required"]?.extensions?.bazaar?.info?.input?.method;
  if (method === "GET" || method === "POST") return method;
  if (tool.name?.startsWith("x402_get_")) return "GET";
  if (tool.name?.startsWith("x402_post_")) return "POST";
  return null;
}

function exampleInputFromTool(tool: McpToolRaw): Record<string, unknown> | null {
  const input = tool._meta?.["x402/payment-required"]?.extensions?.bazaar?.info?.input;
  if (!input) return null;
  if (input.body && typeof input.body === "object") return input.body;
  if (input.queryParams && typeof input.queryParams === "object") return input.queryParams;
  return null;
}

/** Parse full MCP `search_resources` payload into catalog tools. */
export function parseMcpCatalogTools(result: unknown): CatalogTool[] {
  const content = (result as { content?: Array<{ text?: string }> })?.content;
  const text = content?.[0]?.text;
  if (!text) return [];

  try {
    const parsed = JSON.parse(text) as { tools?: McpToolRaw[] };
    return (parsed.tools ?? [])
      .filter((t): t is McpToolRaw & { name: string } => typeof t.name === "string")
      .map((t) => {
        const desc = t.description ?? "";
        const quality = qualityFromDescription(desc);
        return {
          mcpToolName: t.name,
          displayName: displayNameFromTool(t),
          description: desc.slice(0, 400),
          catalogUsdc: catalogUsdcFromTool(t),
          probeUsdc: null,
          network: networkFromTool(t),
          payers30d: quality.payers,
          calls30d: quality.calls,
          inputSchema: t.inputSchema,
          httpResource: httpResourceFromName(t.name),
          resourceUrl: null,
          catalogPayTo: payToFromTool(t),
          httpMethod: httpMethodFromTool(t),
          exampleInput: exampleInputFromTool(t),
          curated: Boolean(t._meta?.["x402/curation"]?.curated),
        };
      });
  } catch {
    return [];
  }
}

async function probeCatalogTool(tool: CatalogTool, goal: string): Promise<CatalogTool> {
  const endpoint = tool.resourceUrl ?? tool.httpResource;
  if (!endpoint) return tool;

  const method = tool.httpMethod ?? (tool.mcpToolName.startsWith("x402_get_") ? "GET" : "POST");
  let url = endpoint;
  let init: RequestInit;

  if (method === "GET") {
    const u = new URL(url);
    if (!u.searchParams.has("q") && !u.searchParams.has("query")) {
      u.searchParams.set("query", goal.slice(0, 80));
    }
    url = u.toString();
    init = { method: "GET" };
  } else {
    const body = tool.exampleInput ?? { query: goal.slice(0, 200) };
    init = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    };
  }

  try {
    const q = await probeQuote(url, init, tool.displayName);
    return { ...tool, probeUsdc: q.usdc, network: q.network };
  } catch {
    return tool;
  }
}

/** Discover Bazaar MCP tools for a goal (semantic search + dedupe). */
export async function discoverToolCatalog(goal: string, limit = 24): Promise<CatalogTool[]> {
  const result = await mcpSearchResources(goal);
  const tools = parseMcpCatalogTools(result);
  const seen = new Set<string>();
  const out: CatalogTool[] = [];

  // Prefer curated + higher unique payers first so the planner sees better options.
  const ranked = [...tools].sort((a, b) => {
    const cur = Number(b.curated) - Number(a.curated);
    if (cur !== 0) return cur;
    return (b.payers30d ?? -1) - (a.payers30d ?? -1);
  });

  for (const t of ranked) {
    if (seen.has(t.mcpToolName)) continue;
    seen.add(t.mcpToolName);
    out.push(t);
    if (out.length >= limit) break;
  }

  return out;
}

/** Merge catalogs from goal + optional user pick queries (deduped). */
export async function discoverToolCatalogForPlanning(
  goal: string,
  userToolPicks?: string[],
  limit = 28,
): Promise<CatalogTool[]> {
  const seen = new Set<string>();
  const out: CatalogTool[] = [];

  const add = (tools: CatalogTool[]) => {
    for (const t of tools) {
      if (seen.has(t.mcpToolName)) continue;
      seen.add(t.mcpToolName);
      out.push(t);
    }
  };

  add(await discoverToolCatalog(goal, limit));
  for (const pick of userToolPicks ?? []) {
    if (out.length >= limit) break;
    add(await discoverToolCatalog(pick, 10));
  }

  const discoveryQueries = [goal, ...(userToolPicks ?? [])];
  const discoveryRows: DiscoveryResource[] = [];
  const seenResources = new Set<string>();
  for (const q of discoveryQueries) {
    if (discoveryRows.length >= 20) break;
    for (const row of await searchDiscoveryResources(q, 20)) {
      if (seenResources.has(row.resource)) continue;
      seenResources.add(row.resource);
      discoveryRows.push(row);
    }
  }

  return enrichToolsWithDiscovery(out.slice(0, limit), discoveryRows);
}

/** Live 402 probe on planner-selected tools (best-effort). */
export async function probeSelectedTools(
  tools: CatalogTool[],
  goal: string,
): Promise<CatalogTool[]> {
  const probed: CatalogTool[] = [];
  for (const tool of tools) {
    probed.push(await probeCatalogTool(tool, goal));
  }
  return probed;
}

export function findCatalogTool(catalog: CatalogTool[], mcpToolName: string): CatalogTool | undefined {
  return catalog.find((t) => t.mcpToolName === mcpToolName);
}

export function effectiveUsdc(tool: CatalogTool): number {
  return tool.probeUsdc ?? tool.catalogUsdc ?? 0;
}
