import type { ReportDocument, ReportSection } from "./report-document.js";

function escapeMd(text: string): string {
  return text.replace(/\|/g, "\\|");
}

function sectionToMarkdown(section: ReportSection): string {
  switch (section.type) {
    case "heading":
      return `${"#".repeat(section.level)} ${section.text}\n`;
    case "paragraph":
      return `${section.text}\n`;
    case "bullets": {
      const title = section.title ? `**${section.title}**\n` : "";
      const items = section.items
        .map((item) => {
          if (item.link) return `- [${item.text || item.link.label}](${item.link.url})`;
          return `- ${item.text}`;
        })
        .join("\n");
      return `${title}${items}\n`;
    }
    case "metrics": {
      const title = section.title ? `**${section.title}**\n` : "";
      const rows = section.items.map((m) => `- **${m.label}:** ${m.value}`).join("\n");
      return `${title}${rows}\n`;
    }
    case "table": {
      const { table } = section;
      const title = table.title ? `**${table.title}**\n` : "";
      const header = `| ${table.columns.map(escapeMd).join(" | ")} |`;
      const sep = `| ${table.columns.map(() => "---").join(" | ")} |`;
      const rows = table.rows.map((r) => `| ${r.map(escapeMd).join(" | ")} |`).join("\n");
      return `${title}${header}\n${sep}\n${rows}\n`;
    }
    case "callout": {
      const title = section.title ? `**${section.title}:** ` : "";
      const prefix = section.variant === "warning" ? "⚠️ " : section.variant === "success" ? "✓ " : "";
      return `> ${prefix}${title}${section.text}\n`;
    }
    case "audit": {
      const lines = [
        `**Security audit** (${section.sourceTool})`,
        `- Grade: **${section.grade}**${section.score ? ` · Score: ${section.score}` : ""}`,
      ];
      if (section.auditedUrl) lines.push(`- Audited: [${section.auditedUrl}](${section.auditedUrl})`);
      for (const f of section.findings) lines.push(`- ${f}`);
      return `${lines.join("\n")}\n`;
    }
    case "receipts": {
      const lines = ["**Payment receipts**", ""];
      for (const line of section.lines) {
        if (line.included || (!line.txHash && line.usdc === 0)) {
          lines.push(`- ${line.service}: Included · $0`);
        } else if (line.explorerUrl) {
          lines.push(`- ${line.service}: $${line.usdc.toFixed(4)} · [Receipt](${line.explorerUrl})`);
        } else {
          lines.push(`- ${line.service}: $${line.usdc.toFixed(4)}`);
        }
      }
      lines.push("", `**Total paid:** $${section.totalUsdc.toFixed(4)} USDC`);
      return `${lines.join("\n")}\n`;
    }
    case "sources": {
      if (section.links.length === 0) return "";
      const items = section.links.map((l) => `- [${l.label}](${l.url})`).join("\n");
      return `${items}\n`;
    }
    default:
      return "";
  }
}

/** Deterministic markdown export — derived from ReportDocument, never from LLM. */
export function reportToMarkdown(doc: ReportDocument): string {
  const parts: string[] = [
    `# ${doc.title}`,
    "",
    `*Goal:* ${doc.goal}`,
    `*Generated:* ${new Date(doc.generatedAt).toLocaleString()} · *Paid:* $${doc.totalUsdc.toFixed(4)} USDC`,
    "",
  ];

  for (const section of doc.sections) {
    const md = sectionToMarkdown(section);
    if (md.trim()) parts.push(md);
  }

  return parts.join("\n").trim() + "\n";
}
