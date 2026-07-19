import { buildReportDocument } from "./build-report.js";
import { reportToMarkdown } from "./report-to-markdown.js";
import { parseReportDocument, type ReportDocument } from "./report-document.js";
import type { SpendLine } from "./run.js";
import type { ToolContextEntry } from "./evidence-extract.js";

export interface ComposeResult {
  document: ReportDocument;
  deliverable: string;
}

/**
 * Deterministic deliverable composition — $0, no LLM.
 * Same tool context + spend always produces the same ReportDocument structure.
 */
export function composeDeliverable(input: {
  goal: string;
  toolContext: unknown[];
  spend: SpendLine[];
  totalUsdc: number;
}): ComposeResult {
  const toolContext = normalizeToolContext(input.toolContext);
  const document = buildReportDocument({
    goal: input.goal,
    toolContext,
    spend: input.spend,
    totalUsdc: input.totalUsdc,
  });
  const validated = parseReportDocument(document);
  const deliverable = reportToMarkdown(validated);
  return { document: validated, deliverable };
}

function normalizeToolContext(context: unknown[]): ToolContextEntry[] {
  return context
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    .map((item) => ({
      tool: typeof item.tool === "string" ? item.tool : "Paid tool",
      mcpToolName: typeof item.mcpToolName === "string" ? item.mcpToolName : undefined,
      data: "data" in item ? item.data : item,
    }));
}
