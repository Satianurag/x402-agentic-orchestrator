#!/usr/bin/env node
/**
 * Unit tests for deterministic report builder ($0, no network).
 */
import { composeDeliverable } from "../src/agent/compose-deliverable.js";
import { extractLinks, extractMetrics, extractSecurityAudits, extractTables } from "../src/agent/evidence-extract.js";
import { reportToMarkdown } from "../src/agent/report-to-markdown.js";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

const cryptoPayload = {
  regime: "CHOP",
  fearGreedIndex: 29,
  sentiment: "Fear",
  assets: [
    { symbol: "BTC", priceUsd: 64424.01, change24h: -0.07 },
    { symbol: "ETH", priceUsd: 1865.1, change24h: -0.36 },
    { symbol: "SOL", priceUsd: 76.24, change24h: -0.02 },
  ],
  sources: [{ name: "CoinGecko", url: "https://www.coingecko.com/en/coins/bitcoin" }],
};

const auditPayload = {
  grade: "C",
  score: 75,
  url: "https://pay.alephant.io/x402/stock-analysis-tool",
  findings: ["Cache-Control: no-store header missing on 402 response"],
};

console.log("=== build-report unit tests ===\n");

const metrics = extractMetrics(cryptoPayload, "Crypto market tick");
assert(metrics.some((m) => m.label.toLowerCase().includes("fear") || m.value === "29"), "expected fear/greed metric");
console.log("  ✓ extractMetrics");

const tables = extractTables(cryptoPayload, "Crypto market tick");
assert(tables.length >= 1 && tables[0].rows.length === 3, "expected assets table");
console.log("  ✓ extractTables");

const links = extractLinks(cryptoPayload, "Crypto market tick");
assert(links.some((l) => l.url.includes("coingecko.com")), "expected human coingecko link");
assert(!links.some((l) => l.url.includes("api.coingecko")), "should filter API URLs");
console.log("  ✓ extractLinks (human only)");

const audits = extractSecurityAudits(auditPayload, "Security audit");
assert(audits.length === 1 && audits[0].grade === "C", "expected grade C audit");
console.log("  ✓ extractSecurityAudits");

const spend = [
  {
    service: "Crypto market tick",
    usdc: 0.05,
    txHash: "0xabc",
    explorerUrl: "https://basescan.org/tx/0xabc",
    network: "eip155:8453",
  },
  {
    service: "Security audit",
    usdc: 0.01,
    txHash: "0xdef",
    explorerUrl: "https://basescan.org/tx/0xdef",
    network: "eip155:8453",
  },
];

const { document, deliverable } = composeDeliverable({
  goal: "Produce a crypto brief on SOL, ETH, and BTC prices",
  toolContext: [
    { tool: "Crypto market tick", mcpToolName: "x402_post_crypto", data: cryptoPayload },
    { tool: "Security audit", mcpToolName: "x402_post_audit", data: auditPayload },
  ],
  spend,
  totalUsdc: 0.06,
});

assert(document.version === "1", "document version");
assert(document.composeMode === "deterministic", "deterministic compose");
assert(document.sections.some((s) => s.type === "table"), "table section");
assert(document.sections.some((s) => s.type === "audit"), "audit section");
assert(document.sections.some((s) => s.type === "receipts"), "receipts section");
assert(deliverable.includes("basescan.org/tx/0xabc"), "markdown has tx link");
assert(deliverable.includes("|"), "markdown has table pipes");
console.log("  ✓ composeDeliverable end-to-end");

const md = reportToMarkdown(document);
assert(md === deliverable, "reportToMarkdown matches compose output");
console.log("  ✓ reportToMarkdown deterministic");

console.log("\n=== ALL TESTS PASSED ===");
