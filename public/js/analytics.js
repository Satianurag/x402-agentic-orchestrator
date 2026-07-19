import { escapeHtml, formatUsdc, explorerUrlForPayment } from "./utils.js";

export async function fetchAnalytics(didToken) {
  const res = await fetch(`/api/analytics?didToken=${encodeURIComponent(didToken)}`);
  if (!res.ok) throw new Error("Failed to load analytics");
  return res.json();
}

export async function fetchLedger(didToken) {
  const res = await fetch(`/api/ledger?didToken=${encodeURIComponent(didToken)}`);
  if (!res.ok) throw new Error("Failed to load ledger");
  return res.json();
}

export function renderSpendChart(container, byService) {
  const entries = Object.entries(byService).sort((a, b) => b[1] - a[1]);
  if (!entries.length) {
    container.innerHTML = "<p class='empty-hint'>No spend data</p>";
    return;
  }
  const max = Math.max(...entries.map(([, v]) => v));
  container.innerHTML = entries.map(([service, amount]) => {
    const pct = max > 0 ? (amount / max) * 100 : 0;
    return `
      <div class="chart-row">
        <span class="chart-label">${escapeHtml(service)}</span>
        <div class="chart-bar-wrap"><div class="chart-bar" style="width:${pct}%"></div></div>
        <span class="chart-value">${formatUsdc(amount)}</span>
      </div>
    `;
  }).join("");
}

export function renderLedgerTable(container, lines) {
  if (!lines.length) {
    container.innerHTML = "<p class='empty-hint'>No transactions recorded</p>";
    return;
  }
  const rows = lines.slice(0, 50).map((line) => {
    const url = explorerUrlForPayment(line);
    const tx = url
      ? `<a href="${url}" target="_blank" rel="noopener">${line.txHash.slice(0, 10)}…</a>`
      : line.txHash || "—";
    return `<tr>
      <td>${new Date(line.createdAt).toLocaleDateString()}</td>
      <td>${escapeHtml(line.service)}</td>
      <td>${formatUsdc(line.usdc)}</td>
      <td>${tx}</td>
    </tr>`;
  }).join("");

  container.innerHTML = `
    <table class="spend-table ledger-table">
      <thead><tr><th>Date</th><th>Step</th><th>Cost</th><th>Receipt</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

export function exportLedgerCsv(didToken) {
  window.open(`/api/ledger/export.csv?didToken=${encodeURIComponent(didToken)}`, "_blank");
}
