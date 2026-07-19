import { z } from "zod";

/** Hyperlink with provenance — URLs are never invented by the renderer. */
export const ReportLinkSchema = z.object({
  label: z.string(),
  url: z.string().url(),
  kind: z.enum(["web", "tx", "bazaar", "api"]).default("web"),
  sourceTool: z.string().optional(),
  sourceField: z.string().optional(),
});

export const ReportFactSchema = z.object({
  id: z.string(),
  label: z.string(),
  value: z.string(),
  sourceTool: z.string(),
  sourceField: z.string().optional(),
});

export const ReportMetricSchema = z.object({
  label: z.string(),
  value: z.string(),
  sourceTool: z.string(),
  sourceField: z.string().optional(),
});

export const ReportTableSchema = z.object({
  title: z.string().optional(),
  columns: z.array(z.string()).min(1),
  rows: z.array(z.array(z.string())).min(1),
  sourceTool: z.string(),
});

export const ReportSectionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("heading"),
    level: z.union([z.literal(2), z.literal(3)]),
    text: z.string(),
  }),
  z.object({
    type: z.literal("paragraph"),
    text: z.string(),
    factIds: z.array(z.string()).optional(),
  }),
  z.object({
    type: z.literal("bullets"),
    title: z.string().optional(),
    items: z.array(
      z.object({
        text: z.string(),
        link: ReportLinkSchema.optional(),
        factId: z.string().optional(),
      }),
    ),
  }),
  z.object({
    type: z.literal("metrics"),
    title: z.string().optional(),
    items: z.array(ReportMetricSchema),
  }),
  z.object({
    type: z.literal("table"),
    table: ReportTableSchema,
  }),
  z.object({
    type: z.literal("callout"),
    variant: z.enum(["info", "warning", "success"]),
    title: z.string().optional(),
    text: z.string(),
  }),
  z.object({
    type: z.literal("audit"),
    grade: z.string(),
    score: z.string().optional(),
    auditedUrl: z.string().url().optional(),
    findings: z.array(z.string()),
    sourceTool: z.string(),
  }),
  z.object({
    type: z.literal("receipts"),
    lines: z.array(
      z.object({
        service: z.string(),
        usdc: z.number(),
        txHash: z.string().optional(),
        explorerUrl: z.string().url().optional(),
        included: z.boolean().optional(),
      }),
    ),
    totalUsdc: z.number(),
  }),
  z.object({
    type: z.literal("sources"),
    links: z.array(ReportLinkSchema),
  }),
]);

export const ReportDocumentSchema = z.object({
  version: z.literal("1"),
  title: z.string(),
  goal: z.string(),
  generatedAt: z.string(),
  totalUsdc: z.number(),
  sections: z.array(ReportSectionSchema),
  sources: z.array(ReportLinkSchema),
  facts: z.array(ReportFactSchema),
  composeMode: z.enum(["deterministic", "llm"]).default("deterministic"),
});

export type ReportLink = z.infer<typeof ReportLinkSchema>;
export type ReportFact = z.infer<typeof ReportFactSchema>;
export type ReportMetric = z.infer<typeof ReportMetricSchema>;
export type ReportTable = z.infer<typeof ReportTableSchema>;
export type ReportSection = z.infer<typeof ReportSectionSchema>;
export type ReportDocument = z.infer<typeof ReportDocumentSchema>;

export function parseReportDocument(input: unknown): ReportDocument {
  return ReportDocumentSchema.parse(input);
}

export function safeParseReportDocument(
  input: unknown,
): { success: true; data: ReportDocument } | { success: false; error: string } {
  const result = ReportDocumentSchema.safeParse(input);
  if (result.success) return { success: true, data: result.data };
  return { success: false, error: result.error.message };
}
