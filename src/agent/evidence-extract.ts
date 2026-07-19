import { isApiOrMachineUrl } from "./synthesize-llm.js";
import type { ReportLink, ReportMetric, ReportTable } from "./report-document.js";

export interface ToolContextEntry {
  tool: string;
  mcpToolName?: string;
  data: unknown;
}

export interface SecurityAudit {
  grade: string;
  score?: string;
  auditedUrl?: string;
  findings: string[];
  sourceTool: string;
}

const SKIP_METRIC_KEYS =
  /^(id|uuid|activityid|txhash|hash|timestamp|createdat|updatedat|block|nonce|chainid|version)$/i;
const METRIC_KEY_HINT =
  /price|amount|score|grade|index|count|total|volume|change|percent|rate|fee|cost|usd|cap|supply|sentiment|fear|greed|regime|median|avg|average/i;

/** Unwrap MCP / HTTP payloads into plain JSON when possible. */
export function unwrapToolPayload(data: unknown): unknown {
  if (data == null) return data;

  if (typeof data === "string") {
    const trimmed = data.trim();
    if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
      try {
        return unwrapToolPayload(JSON.parse(trimmed));
      } catch {
        return data;
      }
    }
    return data;
  }

  if (Array.isArray(data)) return data.map(unwrapToolPayload);

  if (typeof data === "object") {
    const o = data as Record<string, unknown>;

    if (Array.isArray(o.content)) {
      const textItem = o.content.find(
        (c): c is { type: string; text: string } =>
          Boolean(c && typeof c === "object" && "type" in c && (c as { type: string }).type === "text" && "text" in c),
      );
      if (textItem && typeof textItem.text === "string") {
        return unwrapToolPayload(textItem.text);
      }
    }

    const keys = Object.keys(o);
    if (keys.length === 1 && ("data" in o || "result" in o || "body" in o)) {
      return unwrapToolPayload(o.data ?? o.result ?? o.body);
    }
  }

  return data;
}

function humanizeKey(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function isLeafMetricValue(value: unknown): boolean {
  if (typeof value === "number" && Number.isFinite(value)) return true;
  if (typeof value === "boolean") return true;
  if (typeof value === "string") {
    if (value.length > 120) return false;
    if (value.startsWith("http")) return false;
    if (value.includes("\n")) return false;
    return true;
  }
  return false;
}

function shouldCollectMetric(path: string, key: string, value: unknown): boolean {
  if (!isLeafMetricValue(value)) return false;
  if (SKIP_METRIC_KEYS.test(key)) return false;
  const full = `${path}.${key}`;
  if (METRIC_KEY_HINT.test(full) || METRIC_KEY_HINT.test(key)) return true;
  if (typeof value === "number") return true;
  return false;
}

function formatMetricValue(value: unknown): string {
  if (typeof value === "number") {
    if (Math.abs(value) >= 1000) return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
    if (Number.isInteger(value)) return String(value);
    return value.toFixed(4).replace(/\.?0+$/, "");
  }
  return String(value);
}

export function extractMetrics(payload: unknown, sourceTool: string, max = 12): ReportMetric[] {
  const out: ReportMetric[] = [];
  const seen = new Set<string>();

  function walk(node: unknown, path: string, depth: number): void {
    if (out.length >= max || depth > 7 || node == null) return;

    if (Array.isArray(node)) {
      for (let i = 0; i < Math.min(node.length, 8); i++) {
        walk(node[i], `${path}[${i}]`, depth + 1);
      }
      return;
    }

    if (typeof node !== "object") return;
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      const nextPath = path ? `${path}.${key}` : key;
      if (shouldCollectMetric(path, key, value)) {
        const label = humanizeKey(key);
        const dedupe = `${sourceTool}:${label}`;
        if (!seen.has(dedupe)) {
          seen.add(dedupe);
          out.push({
            label,
            value: formatMetricValue(value),
            sourceTool,
            sourceField: nextPath,
          });
        }
      } else if (value && typeof value === "object") {
        walk(value, nextPath, depth + 1);
      }
    }
  }

  walk(payload, "", 0);
  return out;
}

function rowToCells(row: Record<string, unknown>, columns: string[]): string[] {
  return columns.map((col) => {
    const v = row[col];
    if (v == null) return "—";
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
  });
}

function isTableRow(row: unknown): row is Record<string, unknown> {
  return Boolean(row && typeof row === "object" && !Array.isArray(row));
}

export function extractTables(payload: unknown, sourceTool: string, max = 3): ReportTable[] {
  const tables: ReportTable[] = [];

  function tryArray(arr: unknown[], title?: string): void {
    if (tables.length >= max || arr.length < 1 || arr.length > 40) return;
    const objects = arr.filter(isTableRow);
    if (objects.length < 1) return;

    const keySets = objects.map((o) => Object.keys(o).filter((k) => !SKIP_METRIC_KEYS.test(k)));
    const columns = keySets[0]?.filter((k) => keySets.every((ks) => ks.includes(k))) ?? [];
    const usable = columns.filter((c) => objects.some((o) => o[c] != null && typeof o[c] !== "object"));
    if (usable.length < 2) return;

    const finalCols = usable.slice(0, 8);
    tables.push({
      title,
      columns: finalCols.map(humanizeKey),
      rows: objects.slice(0, 25).map((row) => rowToCells(row, finalCols)),
      sourceTool,
    });
  }

  function walk(node: unknown, depth: number): void {
    if (tables.length >= max || depth > 6 || node == null) return;
    if (Array.isArray(node)) {
      tryArray(node);
      return;
    }
    if (typeof node !== "object") return;
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (Array.isArray(value)) tryArray(value, humanizeKey(key));
      else if (value && typeof value === "object") walk(value, depth + 1);
    }
  }

  walk(payload, 0);
  return tables;
}

function cleanUrl(u: string): string {
  return u.replace(/[),.;\]}'"]+$/g, "");
}

export function extractLinks(payload: unknown, sourceTool: string, max = 30): ReportLink[] {
  const text = JSON.stringify(payload);
  const found = text.match(/https?:\/\/[^\s"'\\<>\]]+/g) ?? [];
  const links: ReportLink[] = [];
  const seen = new Set<string>();

  for (const raw of found) {
    const url = cleanUrl(raw);
    if (!url.startsWith("http") || seen.has(url)) continue;
    seen.add(url);

    const kind = isApiOrMachineUrl(url) ? "api" : "web";
    if (kind === "api") continue;

    let label = url;
    try {
      const u = new URL(url);
      label = u.hostname.replace(/^www\./, "") + (u.pathname.length > 1 ? u.pathname.slice(0, 40) : "");
    } catch {
      /* keep full url */
    }

    links.push({ label, url, kind, sourceTool });
    if (links.length >= max) break;
  }

  return links;
}

function gradeFromValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = value.trim().match(/^[A-F][+-]?$/i);
  return m ? m[0].toUpperCase() : null;
}

function collectFindings(node: unknown): string[] {
  const findings: string[] = [];
  if (Array.isArray(node)) {
    for (const item of node) {
      if (typeof item === "string" && item.trim()) findings.push(item.trim());
      else if (item && typeof item === "object") {
        const o = item as Record<string, unknown>;
        const text = o.message ?? o.title ?? o.description ?? o.issue ?? o.name;
        if (typeof text === "string" && text.trim()) findings.push(text.trim());
      }
    }
  }
  return findings;
}

export function extractSecurityAudits(payload: unknown, sourceTool: string): SecurityAudit[] {
  const audits: SecurityAudit[] = [];

  function walk(node: unknown, depth: number): void {
    if (depth > 8 || node == null) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }
    if (typeof node !== "object") return;

    const o = node as Record<string, unknown>;
    const grade =
      gradeFromValue(o.grade) ??
      gradeFromValue(o.securityGrade) ??
      gradeFromValue(o.rating) ??
      (typeof o.grade === "string" ? o.grade : null);

    const scoreRaw = o.score ?? o.securityScore ?? o.overallScore;
    const score = scoreRaw != null ? String(scoreRaw) : undefined;
    const findings = collectFindings(o.findings ?? o.issues ?? o.vulnerabilities ?? o.warnings);

    const auditedUrl =
      typeof o.url === "string" && o.url.startsWith("http")
        ? o.url
        : typeof o.auditedUrl === "string" && o.auditedUrl.startsWith("http")
          ? o.auditedUrl
          : typeof o.target === "string" && o.target.startsWith("http")
            ? o.target
            : undefined;

    if (grade && (score || findings.length > 0 || auditedUrl)) {
      audits.push({ grade, score, auditedUrl, findings, sourceTool });
    }

    for (const value of Object.values(o)) {
      if (value && typeof value === "object") walk(value, depth + 1);
    }
  }

  walk(payload, 0);
  return audits;
}

const GOAL_TICKERS = ["BTC", "ETH", "SOL", "USDC", "USDT", "XRP", "DOGE", "ADA", "AVAX", "LINK"];

export function detectDataGaps(goal: string, contextJson: string): string[] {
  const gaps: string[] = [];
  for (const ticker of GOAL_TICKERS) {
    if (!new RegExp(`\\b${ticker}\\b`, "i").test(goal)) continue;
    if (!new RegExp(ticker, "i").test(contextJson)) {
      gaps.push(`${ticker} not found in paid tool results`);
    }
  }
  return gaps;
}

export function buildRuleRecommendations(audits: SecurityAudit[]): string[] {
  const recs: string[] = [];

  for (const audit of audits) {
    const grade = audit.grade.toUpperCase();
    if (grade.startsWith("C") || grade.startsWith("D") || grade.startsWith("F")) {
      const target = audit.auditedUrl ? ` (${audit.auditedUrl})` : "";
      recs.push(`Improve security posture for audited endpoint${target} — current grade ${audit.grade}.`);
    }
    for (const finding of audit.findings) {
      if (/cache-control|no-store|no-cache/i.test(finding)) {
        recs.push("Add appropriate Cache-Control headers on x402 payment endpoints.");
        break;
      }
    }
  }

  return [...new Set(recs)];
}

export function titleFromGoal(goal: string): string {
  const trimmed = goal.trim();
  if (trimmed.length <= 72) return trimmed;
  const sentence = trimmed.split(/[.!?]/)[0]?.trim();
  if (sentence && sentence.length >= 12 && sentence.length <= 80) return sentence;
  return `${trimmed.slice(0, 69)}…`;
}
