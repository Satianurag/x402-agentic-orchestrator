import { escapeHtml, formatUsdc, renderMarkdown } from "./utils.js";

export async function fetchHistory(didToken) {
  const res = await fetch(`/api/history?didToken=${encodeURIComponent(didToken)}`);
  if (!res.ok) throw new Error("Failed to load history");
  return res.json();
}

export async function fetchRun(didToken, runId) {
  const res = await fetch(`/api/history/${encodeURIComponent(runId)}?didToken=${encodeURIComponent(didToken)}`);
  if (!res.ok) throw new Error("Run not found");
  return res.json();
}

function statusBadge(status) {
  const cls = `history-status history-status--${status}`;
  return `<span class="${cls}">${status}</span>`;
}

export function renderHistoryItem(run, { compact = false } = {}) {
  const date = new Date(run.createdAt).toLocaleString();
  const goal = escapeHtml(run.goal.slice(0, compact ? 60 : 120));
  return `
    <article class="history-item" data-run-id="${run.id}">
      <div class="history-item-head">
        <time datetime="${run.createdAt}">${date}</time>
        ${statusBadge(run.status)}
      </div>
      <p class="history-goal">${goal}${run.goal.length > (compact ? 60 : 120) ? "…" : ""}</p>
      <div class="history-item-meta">
        <span>${formatUsdc(run.totalUsdc)}</span>
        ${run.budgetUsdc ? `<span>limit ${formatUsdc(run.budgetUsdc)}</span>` : ""}
      </div>
      <div class="history-item-actions">
        <button type="button" class="btn btn-secondary btn-sm history-open-btn" data-run-id="${run.id}">Open</button>
        <button type="button" class="btn btn-secondary btn-sm history-rerun-btn" data-goal="${escapeHtml(run.goal)}" data-budget="${run.budgetUsdc ?? 0.15}">Re-run</button>
      </div>
    </article>
  `;
}

export function renderHistoryList(container, runs, options) {
  if (!runs.length) {
    container.innerHTML = "";
    return false;
  }
  container.innerHTML = runs.map((r) => renderHistoryItem(r, options)).join("");
  return true;
}

export function openRunInResult(run, callbacks) {
  const result = {
    deliverable: run.deliverable,
    document: run.document,
    spend: run.spend,
    totalUsdc: run.totalUsdc,
    uaTopUpTxId: run.uaTopUpTxId,
    goal: run.goal,
  };
  callbacks.renderResult(result);
}

export async function fetchCustomAgents(didToken) {
  const res = await fetch(`/api/agents/custom?didToken=${encodeURIComponent(didToken)}`);
  if (!res.ok) return [];
  return res.json();
}

export async function saveCustomAgent(didToken, payload) {
  const res = await fetch("/api/agents/custom", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ didToken, ...payload }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error ?? "Save failed");
  }
  return res.json();
}
