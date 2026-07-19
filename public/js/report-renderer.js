import { escapeHtml, formatUsdc } from "./utils.js";

function renderLink(link) {
  const label = escapeHtml(link.label || link.url);
  return `<a href="${escapeHtml(link.url)}" target="_blank" rel="noopener">${label} ↗</a>`;
}

function renderSection(section) {
  switch (section.type) {
    case "heading": {
      const tag = section.level === 2 ? "h2" : "h3";
      return `<${tag} class="report-heading">${escapeHtml(section.text)}</${tag}>`;
    }
    case "paragraph":
      return `<p class="report-p">${escapeHtml(section.text)}</p>`;
    case "bullets": {
      const title = section.title
        ? `<p class="report-bullets-title"><strong>${escapeHtml(section.title)}</strong></p>`
        : "";
      const items = section.items
        .map((item) => {
          const body = item.link ? renderLink(item.link) : escapeHtml(item.text);
          return `<li>${body}</li>`;
        })
        .join("");
      return `${title}<ul class="report-bullets">${items}</ul>`;
    }
    case "metrics": {
      const title = section.title
        ? `<p class="report-metrics-title">${escapeHtml(section.title)}</p>`
        : "";
      const cards = section.items
        .map(
          (m) => `
        <div class="report-metric-card">
          <span class="report-metric-label">${escapeHtml(m.label)}</span>
          <span class="report-metric-value">${escapeHtml(m.value)}</span>
          <span class="report-metric-source">${escapeHtml(m.sourceTool)}</span>
        </div>`,
        )
        .join("");
      return `${title}<div class="report-metrics-grid">${cards}</div>`;
    }
    case "table": {
      const { table } = section;
      const title = table.title ? `<p class="report-table-title">${escapeHtml(table.title)}</p>` : "";
      const head = table.columns.map((c) => `<th>${escapeHtml(c)}</th>`).join("");
      const body = table.rows
        .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
        .join("");
      return `${title}
        <div class="report-table-wrap">
          <table class="report-table">
            <thead><tr>${head}</tr></thead>
            <tbody>${body}</tbody>
          </table>
          <p class="report-table-source muted">Source: ${escapeHtml(table.sourceTool)}</p>
        </div>`;
    }
    case "callout": {
      const title = section.title ? `<strong>${escapeHtml(section.title)}</strong> ` : "";
      return `<aside class="report-callout report-callout--${section.variant}" role="note">
        ${title}${escapeHtml(section.text)}
      </aside>`;
    }
    case "audit": {
      const url = section.auditedUrl
        ? `<p class="report-audit-url">Audited: <a href="${escapeHtml(section.auditedUrl)}" target="_blank" rel="noopener">${escapeHtml(section.auditedUrl)} ↗</a></p>`
        : "";
      const findings =
        section.findings.length > 0
          ? `<ul class="report-audit-findings">${section.findings.map((f) => `<li>${escapeHtml(f)}</li>`).join("")}</ul>`
          : "";
      const score = section.score ? `<span class="report-audit-score">Score ${escapeHtml(section.score)}</span>` : "";
      return `<div class="report-audit">
        <div class="report-audit-grade" aria-label="Security grade">${escapeHtml(section.grade)}</div>
        <div class="report-audit-body">
          <p class="report-audit-head"><strong>Security audit</strong> · ${escapeHtml(section.sourceTool)} ${score}</p>
          ${url}
          ${findings}
        </div>
      </div>`;
    }
    case "receipts": {
      const rows = section.lines
        .map((line) => {
          if (line.included || (!line.txHash && line.usdc === 0)) {
            return `<tr><td>${escapeHtml(line.service)}</td><td class="report-receipt-amt">Included · $0</td><td>—</td></tr>`;
          }
          const tx = line.explorerUrl
            ? `<a class="report-receipt-tx" href="${escapeHtml(line.explorerUrl)}" target="_blank" rel="noopener">Receipt ↗</a>`
            : "—";
          return `<tr><td>${escapeHtml(line.service)}</td><td class="report-receipt-amt">${formatUsdc(line.usdc)}</td><td>${tx}</td></tr>`;
        })
        .join("");
      return `<div class="report-receipts">
        <table class="report-receipts-table">
          <thead><tr><th>Step</th><th>Cost</th><th>Proof</th></tr></thead>
          <tbody>${rows}</tbody>
          <tfoot><tr><td colspan="2"><strong>Total paid</strong></td><td><strong>${formatUsdc(section.totalUsdc)}</strong></td></tr></tfoot>
        </table>
      </div>`;
    }
    case "sources": {
      if (!section.links.length) return "";
      const items = section.links.map((l) => `<li>${renderLink(l)}</li>`).join("");
      return `<ul class="report-sources">${items}</ul>`;
    }
    default:
      return "";
  }
}

/** Render structured ReportDocument to HTML (deterministic, all links from IR). */
export function renderReportDocument(doc) {
  if (!doc || doc.version !== "1") return "";

  const meta = `<header class="report-header">
    <p class="report-kicker">Verified deliverable</p>
    <h1 class="report-title">${escapeHtml(doc.title)}</h1>
    <p class="report-meta muted">
      <time datetime="${escapeHtml(doc.generatedAt)}">${new Date(doc.generatedAt).toLocaleString()}</time>
      · Paid <strong>${formatUsdc(doc.totalUsdc)}</strong> USDC
      · ${doc.composeMode === "deterministic" ? "Deterministic" : "LLM-assisted"}
    </p>
    <p class="report-goal muted">Goal: ${escapeHtml(doc.goal)}</p>
  </header>`;

  const body = doc.sections.map(renderSection).join("\n");
  return `<div class="report-document">${meta}${body}</div>`;
}

/** Prefer structured document; fall back to legacy markdown. */
export function renderDeliverable(result) {
  if (result?.document?.version === "1") {
    return renderReportDocument(result.document);
  }
  return null;
}
