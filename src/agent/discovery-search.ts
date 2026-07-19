import { getPaymentCaip2 } from "../config/chains.js";

/** Row from CDP GET /platform/v2/x402/discovery/search (buyer catalog). */
export interface DiscoveryResource {
  resource: string;
  description?: string;
  lastUpdated?: string;
  accepts?: Array<{ network?: string; payTo?: string; amount?: string }>;
}

const CDP_DISCOVERY_SEARCH_URL =
  "https://api.cdp.coinbase.com/platform/v2/x402/discovery/search";

function cdpAuthHeader(): string | null {
  const id = process.env.CDP_API_KEY_ID?.trim();
  const secret = process.env.CDP_API_KEY_SECRET?.trim();
  if (!id || !secret) return null;
  return `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;
}

/**
 * CDP Bazaar semantic search — returns canonical `resource` URLs for HTTP sellers.
 * Best-effort: returns [] when credentials are missing or the API errors.
 *
 * @see https://docs.cdp.coinbase.com/x402/bazaar — discovery/search
 */
export async function searchDiscoveryResources(
  query: string,
  limit = 20,
): Promise<DiscoveryResource[]> {
  const auth = cdpAuthHeader();
  if (!auth || !query.trim()) return [];

  const paymentNetwork = getPaymentCaip2();
  const params = new URLSearchParams({
    query: query.trim().slice(0, 400),
    network: paymentNetwork,
    limit: String(Math.min(Math.max(limit, 1), 20)),
  });

  try {
    const res = await fetch(`${CDP_DISCOVERY_SEARCH_URL}?${params}`, {
      headers: { authorization: auth, accept: "application/json" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) {
      console.warn(`[discovery] search failed (${res.status}) for query=${query.slice(0, 60)}`);
      return [];
    }
    const data = (await res.json()) as { resources?: DiscoveryResource[] };
    return (data.resources ?? []).filter((r) => typeof r.resource === "string" && r.resource.startsWith("https://"));
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.warn(`[discovery] search error: ${detail}`);
    return [];
  }
}

/** Extract a hostname hint from Bazaar MCP tool names (e.g. pay_alephant_io → pay.alephant.io). */
export function hostHintFromMcpToolName(mcpToolName: string): string | null {
  const m = mcpToolName.match(/^x402_(?:get|post)_https___(.+?)_[a-f0-9]{8,}_/i);
  if (!m) return null;

  const raw = m[1];
  const tldMatch = raw.match(/^(.+?)_(io|com|ai|app|dev|net|org|tools)_(.+)$/i);
  if (tldMatch) {
    const host = `${tldMatch[1].replace(/_/g, ".")}.${tldMatch[2].toLowerCase()}`;
    return host;
  }
  return null;
}

function slugFromMcpToolName(mcpToolName: string): string {
  const m = mcpToolName.match(/^x402_(?:get|post)_https___(.+?)_[a-f0-9]{8,}_/i);
  if (!m) return mcpToolName.toLowerCase();
  return m[1].replace(/_/g, "-").toLowerCase();
}

function pathMatchScore(mcpToolName: string, resourceUrl: string): number {
  let score = 0;
  const slug = slugFromMcpToolName(mcpToolName);
  const path = new URL(resourceUrl).pathname.toLowerCase().replace(/_/g, "-");
  const slugParts = slug.split("-").filter((p) => p.length > 2);
  for (const part of slugParts) {
    if (path.includes(part)) score += 2;
  }
  if (path.includes(slug.replace(/-/g, "")) || slug.includes(path.replace(/\//g, "-").replace(/^-/, ""))) {
    score += 3;
  }
  return score;
}

function payToOnPaymentNetwork(
  accepts: DiscoveryResource["accepts"],
): string | null {
  const network = getPaymentCaip2();
  const match = accepts?.find((a) => a.network === network);
  return match?.payTo?.toLowerCase() ?? null;
}

/**
 * Map a Bazaar MCP tool to the canonical HTTPS resource URL from discovery search.
 * Matches on seller payTo + path similarity (fixes underscore vs hyphen URL drift).
 */
export function matchDiscoveryResourceUrl(
  mcpToolName: string,
  toolPayTo: string | null,
  resources: DiscoveryResource[],
): string | null {
  if (resources.length === 0) return null;

  const hostHint = hostHintFromMcpToolName(mcpToolName);
  let best: { url: string; score: number } | null = null;

  for (const row of resources) {
    let score = pathMatchScore(mcpToolName, row.resource);

    if (hostHint && row.resource.includes(hostHint)) score += 8;

    const rowPayTo = payToOnPaymentNetwork(row.accepts);
    if (toolPayTo && rowPayTo && toolPayTo.toLowerCase() === rowPayTo) score += 12;

    if (!best || score > best.score) {
      best = { url: row.resource, score };
    }
  }

  // Require a minimal confidence bar so we do not attach random URLs.
  if (!best || best.score < 4) return null;
  return best.url;
}
