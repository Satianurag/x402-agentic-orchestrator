import type { SpendLine } from "./run.js";
import {
  buildRuleRecommendations,
  detectDataGaps,
  extractLinks,
  extractMetrics,
  extractSecurityAudits,
  extractTables,
  titleFromGoal,
  unwrapToolPayload,
  type ToolContextEntry,
} from "./evidence-extract.js";
import type { ReportDocument, ReportFact, ReportLink, ReportSection } from "./report-document.js";

export interface BuildReportInput {
  goal: string;
  toolContext: ToolContextEntry[];
  spend: SpendLine[];
  totalUsdc: number;
  generatedAt?: string;
}

let factCounter = 0;

function nextFactId(): string {
  factCounter += 1;
  return `f${factCounter}`;
}

function resetFactCounter(): void {
  factCounter = 0;
}

export function buildReportDocument(input: BuildReportInput): ReportDocument {
  resetFactCounter();

  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const sections: ReportSection[] = [];
  const facts: ReportFact[] = [];
  const allLinks: ReportLink[] = [];
  const allAudits = [];

  const contextJson = JSON.stringify(input.toolContext);

  for (const entry of input.toolContext) {
    const payload = unwrapToolPayload(entry.data);
    const sourceTool = entry.tool || entry.mcpToolName || "Paid tool";

    sections.push({ type: "heading", level: 2, text: sourceTool });

    const metrics = extractMetrics(payload, sourceTool);
    if (metrics.length > 0) {
      for (const m of metrics) {
        facts.push({
          id: nextFactId(),
          label: m.label,
          value: m.value,
          sourceTool: m.sourceTool,
          sourceField: m.sourceField,
        });
      }
      sections.push({ type: "metrics", title: "Key metrics", items: metrics });
    }

    const tables = extractTables(payload, sourceTool);
    for (const table of tables) {
      sections.push({ type: "table", table });
    }

    const audits = extractSecurityAudits(payload, sourceTool);
    allAudits.push(...audits);
    for (const audit of audits) {
      sections.push({
        type: "audit",
        grade: audit.grade,
        score: audit.score,
        auditedUrl: audit.auditedUrl,
        findings: audit.findings,
        sourceTool: audit.sourceTool,
      });
      if (audit.auditedUrl) {
        allLinks.push({
          label: "Audited endpoint",
          url: audit.auditedUrl,
          kind: "web",
          sourceTool: audit.sourceTool,
        });
      }
    }

    const links = extractLinks(payload, sourceTool);
    allLinks.push(...links);

    if (metrics.length === 0 && tables.length === 0 && audits.length === 0) {
      const preview =
        typeof payload === "string"
          ? payload.slice(0, 400)
          : JSON.stringify(payload, null, 2).slice(0, 600);
      sections.push({
        type: "callout",
        variant: "info",
        title: "Raw tool response",
        text: preview + (preview.length >= 400 ? "…" : ""),
      });
    }
  }

  const gaps = detectDataGaps(input.goal, contextJson);
  if (gaps.length > 0) {
    sections.push({ type: "heading", level: 2, text: "Data gaps" });
    sections.push({
      type: "bullets",
      items: gaps.map((text) => ({ text })),
    });
    sections.push({
      type: "callout",
      variant: "warning",
      text: "These items were requested in the goal but were not found in paid tool payloads.",
    });
  }

  const recommendations = buildRuleRecommendations(allAudits);
  if (recommendations.length > 0) {
    sections.push({ type: "heading", level: 2, text: "Recommendations" });
    sections.push({
      type: "bullets",
      items: recommendations.map((text) => ({ text })),
    });
  }

  const paidLines = input.spend.filter((l) => !l.included && l.usdc > 0);
  const txLinks: ReportLink[] = [];
  for (const line of input.spend) {
    if (line.explorerUrl) {
      txLinks.push({
        label: `${line.service} receipt`,
        url: line.explorerUrl,
        kind: "tx",
        sourceTool: line.service,
      });
    }
  }

  const uniqueSources = dedupeLinks([...allLinks, ...txLinks]);

  if (uniqueSources.length > 0) {
    sections.push({ type: "heading", level: 2, text: "Sources & receipts" });
    sections.push({
      type: "sources",
      links: uniqueSources.filter((l) => l.kind !== "tx"),
    });
  }

  sections.push({
    type: "receipts",
    lines: input.spend.map((l) => ({
      service: l.service,
      usdc: l.usdc,
      txHash: l.txHash || undefined,
      explorerUrl: l.explorerUrl || undefined,
      included: l.included,
    })),
    totalUsdc: input.totalUsdc,
  });

  if (paidLines.length > 0) {
    sections.unshift({
      type: "callout",
      variant: "success",
      title: "Verified x402 run",
      text: `${paidLines.length} paid step${paidLines.length === 1 ? "" : "s"} · $${input.totalUsdc.toFixed(4)} USDC on-chain.`,
    });
  }

  return {
    version: "1",
    title: titleFromGoal(input.goal),
    goal: input.goal,
    generatedAt,
    totalUsdc: input.totalUsdc,
    sections,
    sources: uniqueSources,
    facts,
    composeMode: "deterministic",
  };
}

function dedupeLinks(links: ReportLink[]): ReportLink[] {
  const seen = new Set<string>();
  const out: ReportLink[] = [];
  for (const link of links) {
    if (seen.has(link.url)) continue;
    seen.add(link.url);
    out.push(link);
  }
  return out;
}
