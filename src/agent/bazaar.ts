import { HTTPFacilitatorClient } from "@x402/core/server";
import { withBazaar } from "@x402/extensions/bazaar";
import { CDP_FACILITATOR_URL } from "@coinbase/cdp-sdk/x402";
import { atomicToUsdc, getPaymentCaip2 } from "../config/chains.js";
import { probeQuote } from "../services/x402-client.js";

/** CDP Bazaar discovery client — @x402/extensions `withBazaar` per CDP buyer quickstart. */
function getBazaarClient() {
  return withBazaar(new HTTPFacilitatorClient({ url: CDP_FACILITATOR_URL }));
}

export interface BazaarResource {
  resource: string;
  serviceName?: string;
  description?: string;
  accepts: Array<{ amount?: string; maxAmountRequired?: string; network?: string }>;
  quality?: { l30DaysTotalCalls?: number; l30DaysUniquePayers?: number };
  extensions?: {
    bazaar?: {
      info?: {
        input?: {
          method?: string;
          body?: unknown;
          queryParams?: Record<string, string>;
        };
      };
    };
  };
}

export interface BazaarAlternative {
  name: string;
  url: string;
  catalogUsdc: number;
  probeUsdc: number | null;
  network: string | null;
  payers30d: number;
  calls30d: number;
  description: string;
}

function catalogUsdc(resource: BazaarResource): number | null {
  const acc = resource.accepts[0];
  if (!acc) return null;
  const raw = acc.amount ?? acc.maxAmountRequired;
  if (!raw) return null;
  return atomicToUsdc(BigInt(raw));
}

/** Semantic search via `facilitator.extensions.bazaar.search` (CDP discovery/search). */
export async function searchBazaar(query: string, limit = 5): Promise<BazaarResource[]> {
  const client = getBazaarClient();
  const result = await client.extensions.bazaar.search({
    query,
    limit,
    network: getPaymentCaip2(),
    type: "http",
  });
  return (result.resources ?? []) as BazaarResource[];
}

async function probeBazaarResource(
  resource: BazaarResource,
  goal: string,
): Promise<{ usdc: number; network: string } | null> {
  const input = resource.extensions?.bazaar?.info?.input;
  const method = (input?.method ?? "GET").toUpperCase();
  let url = resource.resource;
  let init: RequestInit;

  if (method === "GET") {
    const u = new URL(url);
    if (input?.queryParams) {
      for (const [k, v] of Object.entries(input.queryParams)) {
        u.searchParams.set(k, /query|search|q/i.test(k) ? goal.slice(0, 80) : v);
      }
    }
    url = u.toString();
    init = { method: "GET" };
  } else if (method === "POST") {
    init = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input?.body ?? { query: goal }),
    };
  } else {
    return null;
  }

  try {
    return await probeQuote(url, init, resource.serviceName ?? url);
  } catch {
    return null;
  }
}

export async function findBazaarAlternatives(
  query: string,
  goal: string,
  limit = 3,
): Promise<BazaarAlternative[]> {
  const resources = await searchBazaar(query, limit + 2);
  const ranked = resources
    .map((r) => ({
      r,
      catalog: catalogUsdc(r),
      payers: r.quality?.l30DaysUniquePayers ?? 0,
      calls: r.quality?.l30DaysTotalCalls ?? 0,
    }))
    .filter((x) => x.catalog != null)
    .sort((a, b) => (a.catalog! - b.catalog!) || (b.payers - a.payers));

  const out: BazaarAlternative[] = [];
  for (const item of ranked) {
    if (out.length >= limit) break;
    const probed = await probeBazaarResource(item.r, goal);
    out.push({
      name: item.r.serviceName ?? new URL(item.r.resource).hostname,
      url: item.r.resource,
      catalogUsdc: item.catalog!,
      probeUsdc: probed?.usdc ?? null,
      network: probed?.network ?? item.r.accepts[0]?.network ?? null,
      payers30d: item.payers,
      calls30d: item.calls,
      description: (item.r.description ?? "").slice(0, 160),
    });
  }
  return out;
}
