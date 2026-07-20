import type { CatalogTool } from "./tool-catalog.js";
import type { PlannerResult, PlannerToolPick, PlannerWarning } from "./tool-planner.js";

/** Tools that are themselves LLM narratives — buying them + local compose = double-LLM waste. */
const DOUBLE_LLM_RE =
  /\bllm[- ]written\b|\bai[- ]written\b|\bone call,? the whole market\b|\bllm[- ]generated\b.*\b(brief|report|briefing)\b/i;

const ASSET_PATTERNS: Array<{ id: string; re: RegExp; toolRe: RegExp }> = [
  { id: "BTC", re: /\b(btc|bitcoin)\b/i, toolRe: /\b(btc|bitcoin)\b/i },
  { id: "ETH", re: /\b(eth|ethereum)\b/i, toolRe: /\b(eth|ethereum)\b/i },
  { id: "SOL", re: /\b(sol|solana)\b/i, toolRe: /\b(sol|solana)\b/i },
];

function toolBlob(tool: CatalogTool | undefined, pick: PlannerToolPick): string {
  return `${pick.mcpToolName} ${pick.displayName} ${tool?.description ?? ""} ${pick.why ?? ""}`;
}

export function isDoubleLlmTool(tool: CatalogTool | undefined, pick: PlannerToolPick): boolean {
  return DOUBLE_LLM_RE.test(toolBlob(tool, pick));
}

/**
 * Drop wasteful LLM-brief tools and emit coverage warnings for multi-asset price goals.
 * Cheap path: keep minimum primary-source tools only.
 */
export function applyPlannerGuards(
  goal: string,
  result: PlannerResult,
  catalog: CatalogTool[],
): PlannerResult {
  const byName = new Map(catalog.map((t) => [t.mcpToolName, t]));
  const warnings: PlannerWarning[] = [...result.warnings];
  const kept: PlannerToolPick[] = [];

  for (const pick of result.selectedTools) {
    const tool = byName.get(pick.mcpToolName);
    if (isDoubleLlmTool(tool, pick)) {
      warnings.push({
        issue: "Skipped LLM-brief tool (saves money)",
        reason:
          `"${pick.displayName}" is itself an LLM narrative. Our local compose is free — ` +
          "buying this would double-pay for rewriting.",
        alternatives: catalog
          .filter((t) => !DOUBLE_LLM_RE.test(`${t.displayName} ${t.description}`))
          .slice(0, 3)
          .map((t) => t.displayName),
      });
      continue;
    }
    kept.push(pick);
  }

  const wantsPrices = /\b(price|prices|spot|quote|quotes)\b/i.test(goal);
  if (wantsPrices) {
    const mentioned = ASSET_PATTERNS.filter((a) => a.re.test(goal));
    if (mentioned.length >= 2) {
      const covered = mentioned.filter((a) =>
        kept.some((p) => a.toolRe.test(toolBlob(byName.get(p.mcpToolName), p))),
      );
      const missing = mentioned.filter((a) => !covered.includes(a)).map((a) => a.id);
      if (missing.length) {
        warnings.push({
          issue: "Incomplete price coverage",
          reason:
            `Goal asks for ${mentioned.map((a) => a.id).join(", ")} but selected tools only cover ` +
            `${covered.map((a) => a.id).join(", ") || "none"}. Missing: ${missing.join(", ")}. ` +
            "Deliverable will mark those gaps instead of inventing prices.",
          alternatives: catalog
            .filter((t) => missing.some((id) => ASSET_PATTERNS.find((a) => a.id === id)!.toolRe.test(`${t.mcpToolName} ${t.description}`)))
            .slice(0, 4)
            .map((t) => t.displayName),
        });
      }
    }
  }

  // Prefer cheaper tools when many selected — keep top 3 by estimatedUsdc (ascending).
  let selectedTools = kept;
  if (selectedTools.length > 3) {
    const sorted = [...selectedTools].sort((a, b) => a.estimatedUsdc - b.estimatedUsdc);
    const dropped = sorted.slice(3);
    selectedTools = sorted.slice(0, 3);
    warnings.push({
      issue: "Capped to 3 cheapest tools",
      reason: `Dropped higher-cost picks to save money: ${dropped.map((d) => d.displayName).join(", ")}`,
      alternatives: [],
    });
  }

  return {
    ...result,
    selectedTools,
    warnings,
    reasoning:
      (result.reasoning ? `${result.reasoning}\n\n` : "") +
      "Guards: skip double-LLM briefs; local compose is free; prefer cheap primary-source tools.",
  };
}
