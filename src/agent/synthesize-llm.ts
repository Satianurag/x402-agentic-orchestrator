import { GoogleGenAI } from "@google/genai";

/** GA text model — Gemini API changelog May 2026 / models page. */
const GEMINI_MODEL = "gemini-3.1-flash-lite";

/**
 * Local compose (platform LLM) — $0 on the user x402 spend ledger.
 * Not a paid /synthesize settlement; only formats paid tool context.
 */
const SYSTEM_INSTRUCTION =
  "You turn paid x402 tool results into the user's deliverable. Rules:\n" +
  "1) Choose the best output shape for the goal — answer, bullets, table, brief, memo, or report. " +
  "Do NOT default to a long 'market report' unless the goal asks for one.\n" +
  "2) Use ONLY facts present in the collected context. Never invent prices, quotes, or URLs.\n" +
  "3) If the goal asked for multiple assets/topics but context is missing some, state gaps clearly " +
  "(e.g. 'ETH price not in paid tool results') — do not pad with speculation.\n" +
  "4) Citations (critical UX): ONLY link human-readable web pages from the ALLOWED URL list below. " +
  "NEVER link raw API hosts (api.*, */api/*, JSON endpoints) — users clicking those see ugly JSON/errors. " +
  "If there are no allowed human URLs, write Sources as plain text naming the paid tools / data providers " +
  "without markdown links (e.g. 'Fear & Greed via Crypto market tick · prices via Kronos VWM'). " +
  "Never fabricate links.\n" +
  "5) Prefer concise, scannable markdown. No filler narratives.";

/** Strip trailing punctuation from scraped URLs. */
function cleanUrl(u: string): string {
  return u.replace(/[),.;\]}'"]+$/g, "");
}

/**
 * True for machine/API-looking URLs — structural heuristics only, no vendor allow/deny lists.
 * We never hardcode CoinGecko / Alternative.me / etc.
 */
export function isApiOrMachineUrl(url: string): boolean {
  let host = "";
  let pathname = "/";
  try {
    const u = new URL(url);
    host = u.hostname.toLowerCase();
    pathname = u.pathname.toLowerCase();
  } catch {
    return true;
  }

  // Host looks like an API/data service
  if (/^(api|cdn-api|data|rpc|ws|graphql)\./i.test(host) || host.includes(".api.")) {
    return true;
  }

  // Path looks like a machine endpoint, not an article/page
  if (
    pathname.startsWith("/api/") ||
    /\/v\d+\//.test(pathname) ||
    pathname.endsWith(".json") ||
    pathname.includes("/graphql")
  ) {
    return true;
  }

  return false;
}

/** Human-readable pages only — articles, docs sites, public indexes. */
export function extractCitationUrls(context: unknown[]): string[] {
  const text = JSON.stringify(context);
  const found = text.match(/https?:\/\/[^\s"'\\<>\]]+/g) ?? [];
  const cleaned = found.map(cleanUrl);
  const human = cleaned.filter((u) => u.startsWith("http") && !isApiOrMachineUrl(u));
  return [...new Set(human)].slice(0, 40);
}

function toolNamesFromContext(context: unknown[]): string[] {
  const names: string[] = [];
  for (const item of context) {
    if (item && typeof item === "object" && "tool" in item) {
      const t = (item as { tool?: unknown }).tool;
      if (typeof t === "string" && t.trim()) names.push(t.trim());
    }
  }
  return [...new Set(names)];
}

export async function synthesizeWithLlm(goal: string, context: unknown[]): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is required for deliverable composition");
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      retryOptions: { attempts: 5 },
    },
  });

  const citationUrls = extractCitationUrls(context);
  const tools = toolNamesFromContext(context);
  const urlHint =
    citationUrls.length > 0
      ? `\n\nALLOWED human-readable URLs for Sources (markdown links OK):\n${citationUrls.map((u) => `- ${u}`).join("\n")}`
      : "\n\nNo human-readable URLs in payloads. For Sources: list paid tools in plain text only — " +
        "do NOT invent or link api.* / JSON endpoints." +
        (tools.length ? `\nPaid tools used: ${tools.join("; ")}` : "");

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents:
      `Goal: ${goal}\n\n` +
      `Collected context from paid x402 services:\n${JSON.stringify(context, null, 2)}` +
      urlHint,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      temperature: 0.2,
      maxOutputTokens: 8192,
    },
  });

  const content = response.text;
  if (!content) {
    throw new Error("Gemini returned empty composition content");
  }
  return stripUnsafeCitationLinks(content);
}

/** Last line of defense — drop markdown links that point at API/JSON endpoints. */
function stripUnsafeCitationLinks(markdown: string): string {
  return markdown.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, (full, label, url) => {
    if (isApiOrMachineUrl(url)) {
      return String(label);
    }
    return full;
  });
}
