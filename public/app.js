import { Magic } from "https://cdn.jsdelivr.net/npm/magic-sdk@33.9.0/+esm";
import { Signature } from "https://cdn.jsdelivr.net/npm/ethers@6.17.0/+esm";
import {
  escapeHtml,
  renderMarkdown,
  explorerUrlForPayment,
  networkIsArbitrum,
  SERVICE_META,
  loadSettings,
  saveSettings,
  applyTheme,
  requestNotificationPermission,
  notifyRunComplete,
  isInsufficientFunds,
  formatUsdc,
  shortAddr,
} from "./js/utils.js";
import { fetchBalance, renderBalanceHtml, showFundModal, wireFundModal } from "./js/balance.js";
import {
  fetchHistory,
  fetchRun,
  renderHistoryList,
  openRunInResult,
  fetchCustomAgents,
  saveCustomAgent,
} from "./js/history.js";
import {
  fetchAnalytics,
  fetchLedger,
  renderSpendChart,
  renderLedgerTable,
  exportLedgerCsv,
} from "./js/analytics.js";

const views = {
  login: document.getElementById("view-login"),
  dashboard: document.getElementById("view-dashboard"),
  home: document.getElementById("view-home"),
  running: document.getElementById("view-running"),
  result: document.getElementById("view-result"),
  history: document.getElementById("view-history"),
  analytics: document.getElementById("view-analytics"),
  settings: document.getElementById("view-settings"),
};

const emailInput = document.getElementById("email");
const loginBtn = document.getElementById("login-btn");
const loginStatus = document.getElementById("login-status");
const logoutBtn = document.getElementById("logout-btn");
const walletLabel = document.getElementById("wallet-label");
const agentList = document.getElementById("agent-list");
const customAgentList = document.getElementById("custom-agent-list");
const customAgentsFieldset = document.getElementById("custom-agents-fieldset");
const saveAgentBtn = document.getElementById("save-agent-btn");
const goalInput = document.getElementById("goal");
const budgetInput = document.getElementById("budget");
const runBtn = document.getElementById("run-btn");
const stopBtn = document.getElementById("stop-btn");
const againBtn = document.getElementById("again-btn");
const runLog = document.getElementById("run-log");
const budgetFill = document.getElementById("budget-fill");
const budgetLabel = document.getElementById("budget-label");
const deliverableEl = document.getElementById("deliverable");
const spendBody = document.querySelector("#spend-table tbody");
const totalSpent = document.getElementById("total-spent");
const runTimeline = document.getElementById("run-timeline");
const uaTopupCard = document.getElementById("ua-topup-card");
const uaTopupAmount = document.getElementById("ua-topup-amount");
const uaTopupLink = document.getElementById("ua-topup-link");
const uaProofBlock = document.getElementById("ua-proof-block");
const uaProofTxid = document.getElementById("ua-proof-txid");
const uaProofLink = document.getElementById("ua-proof-link");
const appNav = document.getElementById("app-nav");
const networkKicker = document.getElementById("network-kicker");
const runErrorCard = document.getElementById("run-error-card");
const runErrorTitle = document.getElementById("run-error-title");
const runErrorMessage = document.getElementById("run-error-message");
const retryRunBtn = document.getElementById("retry-run-btn");
const errorHomeBtn = document.getElementById("error-home-btn");
const planApprovalCard = document.getElementById("plan-approval-card");
const planApprovalSteps = document.getElementById("plan-approval-steps");
const approvalBudgetInput = document.getElementById("approval-budget");
const approvePlanBtn = document.getElementById("approve-plan-btn");
const rejectPlanBtn = document.getElementById("reject-plan-btn");
const runningTitle = document.getElementById("running-title");
const runningSubtitle = document.getElementById("running-subtitle");
const copyDeliverableBtn = document.getElementById("copy-deliverable-btn");
const downloadMdBtn = document.getElementById("download-md-btn");
const downloadPdfBtn = document.getElementById("download-pdf-btn");
const shareSummaryBtn = document.getElementById("share-summary-btn");
const homeBalanceStrip = document.getElementById("home-balance-strip");
const homeBalanceSummary = document.getElementById("home-balance-summary");
const homeRefreshBalance = document.getElementById("home-refresh-balance");
const homeEmpty = document.getElementById("home-empty");
const balanceDetails = document.getElementById("balance-details");
const refreshBalanceBtn = document.getElementById("refresh-balance-btn");
const fundWalletBtn = document.getElementById("fund-wallet-btn");
const copyFundAddress = document.getElementById("copy-fund-address");
const dashboardEmpty = document.getElementById("dashboard-empty");
const dashboardContent = document.getElementById("dashboard-content");
const dashCumulative = document.getElementById("dash-cumulative");
const dashRunCount = document.getElementById("dash-run-count");
const recentRunsList = document.getElementById("recent-runs-list");
const overageBanner = document.getElementById("overage-banner");
const overageBannerText = document.getElementById("overage-banner-text");
const historyEmpty = document.getElementById("history-empty");
const historyList = document.getElementById("history-list");
const analyticsEmpty = document.getElementById("analytics-empty");
const analyticsContent = document.getElementById("analytics-content");
const analyticsTotal = document.getElementById("analytics-total");
const analyticsCompleted = document.getElementById("analytics-completed");
const analyticsChart = document.getElementById("analytics-chart");
const ledgerTableWrap = document.getElementById("ledger-table-wrap");
const exportCsvBtn = document.getElementById("export-csv-btn");
const settingsNetwork = document.getElementById("settings-network");
const settingsDefaultBudget = document.getElementById("settings-default-budget");
const settingsTheme = document.getElementById("settings-theme");
const settingsNotifications = document.getElementById("settings-notifications");
const healthList = document.getElementById("health-list");
const settingsLogoutBtn = document.getElementById("settings-logout-btn");
const dashLogoutBtn = document.getElementById("dash-logout-btn");
const dashWalletLabel = document.getElementById("dash-wallet-label");

let magic = null;
let didToken = null;
let walletAddress = null;
let signingStep = null;
let currentView = "login";
let lastResult = null;
let pendingRunId = null;
let runAborted = false;
let appConfig = null;

const stepState = new Map();

function normalizeSignatureComponent(value) {
  if (value.startsWith("0x")) return value;
  return `0x${BigInt(value).toString(16).padStart(64, "0")}`;
}

function resolveAuthorizationYParity(signed) {
  if (signed.yParity === 0 || signed.yParity === 1) return signed.yParity;
  if (signed.y_parity === 0 || signed.y_parity === 1) return signed.y_parity;
  const v = Number(signed.v ?? -1);
  if (v === 27) return 0;
  if (v === 28) return 1;
  if (v === 0 || v === 1) return v;
  throw new Error(`Unsupported EIP-7702 authorization signature v/yParity: v=${String(signed.v)}`);
}

function serializeAuthorizationSignature(signed) {
  const yParity = resolveAuthorizationYParity(signed);
  return Signature.from({
    r: normalizeSignatureComponent(signed.r),
    s: normalizeSignatureComponent(signed.s),
    yParity,
  }).serialized;
}

function showView(name) {
  currentView = name;
  for (const [key, el] of Object.entries(views)) {
    if (!el) continue;
    el.classList.toggle("active", key === name);
    el.hidden = key !== name;
  }
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.classList.toggle("nav-btn--active", btn.dataset.view === name);
  });
  if (name === "dashboard") refreshDashboard();
  if (name === "history") refreshHistory();
  if (name === "analytics") refreshAnalytics();
  if (name === "settings") refreshSettings();
  if (name === "home") refreshHome();
}

function appendLog(line) {
  runLog.textContent += line + "\n";
  runLog.scrollTop = runLog.scrollHeight;
}

function updateBudgetBar(spent, cap, remaining) {
  const pct = cap > 0 ? Math.min(100, (spent / cap) * 100) : 0;
  budgetFill.style.width = pct + "%";
  const left = remaining !== undefined ? remaining : Math.max(0, cap - spent);
  budgetLabel.textContent = `$${spent.toFixed(4)} spent · $${left.toFixed(4)} left · $${cap.toFixed(4)} cap`;
}

function statusLabel(state) {
  switch (state) {
    case "queued": return "Queued";
    case "paying": return "Paying…";
    case "signing": return "Signing…";
    case "paid": return "Paid ✓";
    case "settled": return "Settled ✓";
    case "failed": return "Failed";
    case "stopped": return "Stopped";
    default: return state;
  }
}

function txChipHtml(url, label, variant) {
  if (!url) return "";
  const cls = variant ? `tx-chip tx-chip--${variant}` : "tx-chip";
  return `<a class="${cls}" href="${url}" target="_blank" rel="noopener">${label}</a>`;
}

function createStepCard(service) {
  const meta = SERVICE_META[service] || { label: service, icon: "?", chain: "base", blurb: "x402 service" };
  const card = document.createElement("div");
  card.className = "timeline-step timeline-step--queued";
  card.dataset.service = service;
  card.innerHTML = `
    <div class="timeline-icon" aria-hidden="true">${meta.icon}</div>
    <div class="timeline-body">
      <h4>${meta.label}</h4>
      <p>${meta.blurb}</p>
    </div>
    <div class="timeline-meta">
      <span class="timeline-amount" data-amount></span>
      <span class="timeline-status">${statusLabel("queued")}</span>
      <span class="timeline-tx" data-tx></span>
    </div>
  `;
  return card;
}

function setStepState(service, state, paymentLine) {
  const entry = stepState.get(service);
  if (!entry) return;
  entry.state = state;
  const { el } = entry;
  el.className = `timeline-step timeline-step--${state}`;
  const statusEl = el.querySelector(".timeline-status");
  const amountEl = el.querySelector("[data-amount]");
  const txEl = el.querySelector("[data-tx]");
  if (statusEl) statusEl.textContent = statusLabel(state);
  if (paymentLine && amountEl) {
    amountEl.textContent = `$${paymentLine.usdc.toFixed(6)}`;
    const url = explorerUrlForPayment(paymentLine);
    const meta = SERVICE_META[service];
    const variant = meta?.chain === "arbitrum" || networkIsArbitrum(paymentLine.network) ? "arb" : "base";
    const explorerName = variant === "arb" ? "Arbiscan" : "Basescan";
    if (txEl && url) txEl.innerHTML = txChipHtml(url, `${explorerName} ↗`, variant);
  }
}

function buildTimelineFromPlan(plan) {
  runTimeline.innerHTML = "";
  stepState.clear();
  for (const step of plan.steps) {
    const card = createStepCard(step.service);
    runTimeline.appendChild(card);
    stepState.set(step.service, { el: card, state: "queued" });
  }
}

function showUaTopup(event) {
  uaTopupCard.hidden = false;
  uaTopupAmount.textContent = `+$${Number(event.amountUsdc).toFixed(6)} USDC`;
  const trackUrl = `https://universalx.app/activity/details?id=${encodeURIComponent(event.transactionId)}`;
  uaTopupLink.href = trackUrl;
  uaTopupLink.textContent = "Track on UniversalX ↗";
}

function hideRunError() {
  runErrorCard.hidden = true;
}

function showRunError(message, { stopped = false } = {}) {
  runErrorCard.hidden = false;
  runErrorTitle.textContent = stopped ? "Run stopped" : isInsufficientFunds(message) ? "Insufficient funds" : "Run failed";
  runErrorMessage.textContent = message;
  if (isInsufficientFunds(message)) {
    runErrorMessage.innerHTML = `${escapeHtml(message)}<br><br><button type="button" class="btn btn-secondary btn-sm" id="error-fund-btn">Add USDC →</button>`;
    document.getElementById("error-fund-btn")?.addEventListener("click", () => showFundModal(walletAddress));
  }
  runningTitle.textContent = stopped ? "Run stopped" : "Run ended with error";
  runningSubtitle.textContent = stopped
    ? "You requested a stop. No further payments will be made."
    : "Review the error below and retry when ready.";
}

function resetRunUi(budget) {
  runLog.textContent = "";
  runTimeline.innerHTML = "";
  stepState.clear();
  signingStep = null;
  pendingRunId = null;
  runAborted = false;
  uaTopupCard.hidden = true;
  planApprovalCard.hidden = true;
  hideRunError();
  runningTitle.textContent = "Agent is spending real USDC";
  runningSubtitle.textContent = "Each step is a paid x402 call. Watch settlements land on-chain.";
  updateBudgetBar(0, budget);
}

function renderPlanApproval(event) {
  pendingRunId = event.runId;
  planApprovalCard.hidden = false;
  approvalBudgetInput.value = String(event.budgetUsdc);
  planApprovalSteps.innerHTML = event.plan.steps.map((step) => {
    const meta = SERVICE_META[step.service] || { label: step.service };
    return `<div class="plan-step-row"><span>${meta.label}</span><span>~$${step.estCostUsdc.toFixed(4)}</span></div>`;
  }).join("") + `<div class="plan-step-row plan-step-row--total"><span>Estimated total</span><span>$${event.plan.totalEstUsdc.toFixed(4)}</span></div>`;
  runningTitle.textContent = "Awaiting plan approval";
  runningSubtitle.textContent = "Review the plan and budget before any USDC is spent.";
}

async function approvePlan(approved) {
  if (!pendingRunId) return;
  const budget = parseFloat(approvalBudgetInput.value);
  const res = await fetch("/run/resume", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      runId: pendingRunId,
      approved,
      budget: approved ? budget : 0,
    }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error ?? "Approval failed");
  }
  planApprovalCard.hidden = true;
  if (approved) {
    runningTitle.textContent = "Agent is spending real USDC";
    runningSubtitle.textContent = "Each step is a paid x402 call. Watch settlements land on-chain.";
  }
}

async function initMagic() {
  const res = await fetch("/api/config");
  if (!res.ok) throw new Error(`Config failed (${res.status})`);
  appConfig = await res.json();
  if (!appConfig.magicPublishableKey) throw new Error("Missing Magic publishable key");
  magic = new Magic(appConfig.magicPublishableKey, {
    network: appConfig.magicNetwork ?? "ethereum",
  });
  const net = appConfig.network === "mainnet" ? "Live mainnet · Base + Arbitrum One" : "Testnet · Base Sepolia + Arbitrum Sepolia";
  if (networkKicker) networkKicker.textContent = net;
}

function resolveWalletAddress(meta) {
  return meta?.wallets?.ethereum?.publicAddress ?? meta?.publicAddress ?? null;
}

async function loadUserSession() {
  didToken = await magic.user.getIdToken();
  const meta = await magic.user.getInfo();
  walletAddress = resolveWalletAddress(meta);
  if (!walletAddress) throw new Error("Magic wallet has no Ethereum address");
  const label = `Wallet: ${shortAddr(walletAddress)}`;
  walletLabel.textContent = label;
  if (dashWalletLabel) dashWalletLabel.textContent = label;
  if (appNav) appNav.hidden = false;
}

async function refreshBalances(targetEl) {
  if (!didToken || !targetEl) return;
  targetEl.innerHTML = "<p class='empty-hint'>Loading balances…</p>";
  try {
    const balances = await fetchBalance(didToken);
    targetEl.innerHTML = renderBalanceHtml(balances);
  } catch (err) {
    targetEl.innerHTML = `<p class="empty-hint">${escapeHtml(err.message)}</p>`;
  }
}

async function refreshDashboard() {
  if (!didToken) return;
  try {
    const [history, analytics] = await Promise.all([
      fetchHistory(didToken),
      fetchAnalytics(didToken),
    ]);
    const hasRuns = history.length > 0;
    dashboardEmpty.hidden = hasRuns;
    dashboardContent.hidden = !hasRuns;
    if (!hasRuns) return;

    dashCumulative.textContent = formatUsdc(analytics.cumulativeSpend);
    dashRunCount.textContent = `${analytics.totalRuns} run${analytics.totalRuns === 1 ? "" : "s"}`;
    renderHistoryList(recentRunsList, history.slice(0, 5), { compact: true });
    wireHistoryButtons(recentRunsList);

    if (analytics.recentOverBudget > 0) {
      overageBanner.hidden = false;
      overageBannerText.textContent = `${analytics.recentOverBudget} run(s) exceeded their budget cap.`;
    } else {
      overageBanner.hidden = true;
    }

    await refreshBalances(balanceDetails);
  } catch (err) {
    dashboardEmpty.hidden = false;
    dashboardContent.hidden = true;
    dashboardEmpty.querySelector("p").textContent = err.message;
  }
}

async function refreshHome() {
  if (!didToken) return;
  const settings = loadSettings();
  if (settings.defaultBudget && budgetInput) {
    budgetInput.value = String(settings.defaultBudget);
  }
  homeEmpty.hidden = Boolean(goalInput?.value.trim());
  homeBalanceStrip.hidden = false;
  await refreshBalances(homeBalanceSummary);
  await loadCustomAgents();
}

async function refreshHistory() {
  if (!didToken) return;
  try {
    const runs = await fetchHistory(didToken);
    const has = renderHistoryList(historyList, runs);
    historyEmpty.hidden = has;
    wireHistoryButtons(historyList);
  } catch {
    historyEmpty.hidden = false;
    historyList.innerHTML = "";
  }
}

async function refreshAnalytics() {
  if (!didToken) return;
  try {
    const [analytics, ledger] = await Promise.all([
      fetchAnalytics(didToken),
      fetchLedger(didToken),
    ]);
    const has = analytics.totalRuns > 0;
    analyticsEmpty.hidden = has;
    analyticsContent.hidden = !has;
    if (!has) return;
    analyticsTotal.textContent = formatUsdc(analytics.cumulativeSpend);
    analyticsCompleted.textContent = String(analytics.completedRuns);
    renderSpendChart(analyticsChart, analytics.byService);
    renderLedgerTable(ledgerTableWrap, ledger);
  } catch {
    analyticsEmpty.hidden = false;
    analyticsContent.hidden = true;
  }
}

async function refreshSettings() {
  const settings = loadSettings();
  settingsDefaultBudget.value = settings.defaultBudget ?? 0.15;
  settingsTheme.value = settings.theme ?? "light";
  settingsNotifications.checked = Boolean(settings.notifications);

  try {
    const res = await fetch("/api/health");
    const data = await res.json();
    settingsNetwork.textContent = data.network === "mainnet"
      ? "Mainnet — Base + Arbitrum One"
      : "Testnet — Base Sepolia + Arbitrum Sepolia";
    healthList.innerHTML = data.services.map((s) => `
      <li class="health-item health-item--${s.status}">
        <span class="health-name">${escapeHtml(s.name)}</span>
        <span class="health-status">${s.status}</span>
        <span class="health-detail">${escapeHtml(s.detail)}</span>
      </li>
    `).join("");
  } catch {
    settingsNetwork.textContent = "Unknown";
    healthList.innerHTML = "<li class='empty-hint'>Health check unavailable</li>";
  }
}

function wireHistoryButtons(container) {
  container?.querySelectorAll(".history-open-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const run = await fetchRun(didToken, btn.dataset.runId);
      openRunInResult(run, { renderResult });
    });
  });
  container?.querySelectorAll(".history-rerun-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      goalInput.value = btn.dataset.goal;
      budgetInput.value = btn.dataset.budget;
      showView("home");
    });
  });
}

async function loadAgents() {
  const res = await fetch("/agents");
  const agents = await res.json();
  agentList.innerHTML = "";
  for (const agent of agents) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "agent-card";
    btn.setAttribute("role", "listitem");
    btn.innerHTML = `<strong>${agent.name}</strong><span>${agent.description} · suggested $${agent.suggestedBudget}</span>`;
    btn.addEventListener("click", () => selectAgent(btn, agent.goal, agent.suggestedBudget));
    agentList.appendChild(btn);
  }
}

async function loadCustomAgents() {
  if (!didToken) return;
  const agents = await fetchCustomAgents(didToken);
  customAgentsFieldset.hidden = agents.length === 0;
  customAgentList.innerHTML = "";
  for (const agent of agents) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "agent-card agent-card--custom";
    btn.setAttribute("role", "listitem");
    btn.innerHTML = `<strong>${escapeHtml(agent.name)}</strong><span>${escapeHtml(agent.description || "Custom agent")} · $${agent.suggestedBudget}</span>`;
    btn.addEventListener("click", () => selectAgent(btn, agent.goal, agent.suggestedBudget));
    customAgentList.appendChild(btn);
  }
}

function selectAgent(btn, goal, budget) {
  document.querySelectorAll(".agent-card").forEach((c) => c.classList.remove("selected"));
  btn.classList.add("selected");
  goalInput.value = goal;
  budgetInput.value = budget;
  homeEmpty.hidden = true;
}

function renderUaProof(txId) {
  if (!uaProofBlock || !txId) {
    uaProofBlock?.setAttribute("hidden", "");
    return;
  }
  const trackUrl = `https://universalx.app/activity/details?id=${encodeURIComponent(txId)}`;
  uaProofTxid.textContent = txId;
  uaProofLink.href = trackUrl;
  uaProofBlock.removeAttribute("hidden");
}

function renderResult(result) {
  lastResult = result;
  if (result.uaTopUpTxId) renderUaProof(result.uaTopUpTxId);
  else uaProofBlock?.setAttribute("hidden", "");

  deliverableEl.innerHTML = renderMarkdown(result.deliverable);
  spendBody.innerHTML = "";
  for (const line of result.spend) {
    const tr = document.createElement("tr");
    const url = explorerUrlForPayment(line);
    const variant = networkIsArbitrum(line.network) ? "arb" : "base";
    const explorerName = variant === "arb" ? "Arbiscan" : "Basescan";
    const txCell = url
      ? `<a class="spend-tx-link spend-tx-link--${variant}" href="${url}" target="_blank" rel="noopener">${explorerName} ↗ ${line.txHash.slice(0, 10)}…${line.txHash.slice(-6)}</a>`
      : line.txHash || "—";
    tr.innerHTML = `<td>${line.service}</td><td class="spend-amount">$${line.usdc.toFixed(6)}</td><td>${txCell}</td>`;
    spendBody.appendChild(tr);
  }
  totalSpent.innerHTML = `<strong class="total-spent-amount">$${result.totalUsdc.toFixed(6)} USDC</strong>`;
  showView("result");
}

async function handleSignRequest(request) {
  if (!magic || !walletAddress) throw new Error("Magic wallet not ready");
  if (request.kind === "message") {
    return magic.rpcProvider.request({
      method: "personal_sign",
      params: [request.message, walletAddress],
    });
  }
  if (request.kind === "authorization") {
    const auth = request.authorization;
    const signed = await magic.wallet.sign7702Authorization({
      contractAddress: auth.address,
      chainId: auth.chainId,
      nonce: auth.nonce,
    });
    return serializeAuthorizationSignature(signed);
  }
  if (request.kind === "typed_data") {
    const td = request.typedData;
    return magic.rpcProvider.request({
      method: "eth_signTypedData_v4",
      params: [walletAddress, JSON.stringify({
        domain: td.domain,
        types: td.types,
        primaryType: td.primaryType,
        message: td.message,
      })],
    });
  }
  throw new Error(`Unknown sign request kind: ${request.kind}`);
}

async function startRun() {
  if (!didToken) {
    alert("Please sign in with Magic first.");
    showView("login");
    return;
  }

  const goal = goalInput.value.trim();
  const budget = parseFloat(budgetInput.value);
  if (!goal) {
    alert("Please enter a goal or pick a prebuilt agent.");
    return;
  }
  if (!Number.isFinite(budget) || budget <= 0) {
    alert("Budget must be a positive number.");
    return;
  }

  showView("running");
  resetRunUi(budget);

  let spent = 0;
  let activeStep = null;
  let hadError = false;
  let runBudget = budget;

  try {
    const res = await fetch("/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ goal, budget, stream: true, didToken }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error ?? `HTTP ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";

      for (const part of parts) {
        const line = part.trim();
        if (!line.startsWith("data:")) continue;
        const event = JSON.parse(line.slice(5).trim());

        if (event.type === "plan") {
          buildTimelineFromPlan(event.plan);
          appendLog("--- PLAN ---");
          for (const step of event.plan.steps) {
            appendLog(`  ${step.service}: ~$${step.estCostUsdc.toFixed(4)}`);
          }
          appendLog(`  Total est: $${event.plan.totalEstUsdc.toFixed(4)}\n`);
        } else if (event.type === "plan_approval_required") {
          renderPlanApproval(event);
          appendLog("--- AWAITING PLAN APPROVAL ---");
        } else if (event.type === "ua_topup") {
          showUaTopup(event);
          appendLog(`[ua] cross-chain top-up $${event.amountUsdc} id=${event.transactionId}`);
        } else if (event.type === "step_start") {
          activeStep = event.step.service;
          setStepState(activeStep, "paying");
          appendLog(`> ${event.step.service}…`);
        } else if (event.type === "payment") {
          spent += event.line.usdc;
          updateBudgetBar(spent, runBudget, event.remaining);
          setStepState(event.line.service, "paid", event.line);
          activeStep = null;
          appendLog(`  paid $${event.line.usdc.toFixed(6)} tx=${event.line.txHash} · $${event.remaining.toFixed(4)} left`);
        } else if (event.type === "step_done") {
          setStepState(event.step.service, "settled");
          appendLog(`  ✓ ${event.step.service} settled`);
        } else if (event.type === "sign_request") {
          if (activeStep) {
            signingStep = activeStep;
            setStepState(activeStep, "signing");
          }
          appendLog(`  [sign] ${event.request.kind}…`);
          const signature = await handleSignRequest(event.request);
          const signRes = await fetch("/run/sign", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ id: event.request.id, signature }),
          });
          if (!signRes.ok) {
            const err = await signRes.json();
            throw new Error(err.error ?? `Sign ack failed (${signRes.status})`);
          }
          if (signingStep) {
            setStepState(signingStep, "paying");
            signingStep = null;
          }
        } else if (event.type === "error") {
          hadError = true;
          appendLog(`ERROR: ${event.message}`);
          showRunError(event.message, { stopped: runAborted });
        } else if (event.type === "done") {
          notifyRunComplete(goal, event.result.totalUsdc);
          renderResult(event.result);
        }
      }
    }

    if (!lastResult && !hadError) {
      showRunError("Stream ended without a result.", { stopped: runAborted });
    }
  } catch (err) {
    appendLog(`FAILED: ${err.message}`);
    if (activeStep) setStepState(activeStep, runAborted ? "stopped" : "failed");
    showRunError(err.message, { stopped: runAborted });
  }
}

async function restoreSession() {
  const settings = loadSettings();
  applyTheme(settings.theme ?? "light");
  if (!magic) await initMagic();
  const loggedIn = await magic.user.isLoggedIn();
  if (!loggedIn) {
    showView("login");
    return;
  }
  await loadUserSession();
  showView("dashboard");
  await loadAgents();
  wireFundModal(copyFundAddress, walletAddress);
}

loginBtn.addEventListener("click", async () => {
  const email = emailInput.value.trim();
  if (!email) {
    loginStatus.textContent = "Enter your email.";
    return;
  }
  loginBtn.disabled = true;
  loginStatus.textContent = "Check your email for the OTP code…";
  try {
    if (!magic) await initMagic();
    await magic.auth.loginWithEmailOTP({ email, showUI: true });
    await loadUserSession();
    loginStatus.textContent = "";
    showView("dashboard");
    await loadAgents();
    wireFundModal(copyFundAddress, walletAddress);
  } catch (err) {
    loginStatus.textContent = `Login failed: ${err.message}`;
  } finally {
    loginBtn.disabled = false;
  }
});

async function logout() {
  if (magic) await magic.user.logout();
  didToken = null;
  walletAddress = null;
  if (appNav) appNav.hidden = true;
  showView("login");
}

logoutBtn.addEventListener("click", logout);
dashLogoutBtn?.addEventListener("click", logout);
settingsLogoutBtn?.addEventListener("click", logout);

runBtn.addEventListener("click", startRun);
retryRunBtn?.addEventListener("click", startRun);
errorHomeBtn?.addEventListener("click", () => showView("home"));

stopBtn.addEventListener("click", async () => {
  runAborted = true;
  stopBtn.disabled = true;
  stopBtn.textContent = "Stopping…";
  await fetch("/run/stop", { method: "POST" });
  appendLog("Stop requested.");
  if (pendingRunId) {
    try {
      await approvePlan(false);
    } catch {
    }
  }
  stopBtn.disabled = false;
  stopBtn.textContent = "Stop run";
});

approvePlanBtn?.addEventListener("click", async () => {
  approvePlanBtn.disabled = true;
  try {
    const approvedBudget = parseFloat(approvalBudgetInput.value);
    if (Number.isFinite(approvedBudget) && approvedBudget > 0) {
      budgetInput.value = String(approvedBudget);
    }
    await approvePlan(true);
    appendLog("Plan approved — starting spend…");
  } catch (err) {
    showRunError(err.message);
  } finally {
    approvePlanBtn.disabled = false;
  }
});

rejectPlanBtn?.addEventListener("click", async () => {
  runAborted = true;
  try {
    await approvePlan(false);
    showRunError("Run cancelled — plan not approved", { stopped: true });
  } catch (err) {
    showRunError(err.message, { stopped: true });
  }
});

againBtn.addEventListener("click", () => showView("home"));

document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => showView(btn.dataset.view));
});

document.querySelectorAll("[data-goto]").forEach((el) => {
  el.addEventListener("click", () => showView(el.dataset.goto));
});

refreshBalanceBtn?.addEventListener("click", () => refreshBalances(balanceDetails));
homeRefreshBalance?.addEventListener("click", () => refreshBalances(homeBalanceSummary));
fundWalletBtn?.addEventListener("click", () => showFundModal(walletAddress));

saveAgentBtn?.addEventListener("click", async () => {
  const goal = goalInput.value.trim();
  if (!goal) {
    alert("Enter a goal first.");
    return;
  }
  const name = prompt("Agent name:");
  if (!name) return;
  try {
    await saveCustomAgent(didToken, {
      name,
      description: "Custom saved agent",
      goal,
      suggestedBudget: parseFloat(budgetInput.value) || 0.15,
    });
    await loadCustomAgents();
  } catch (err) {
    alert(err.message);
  }
});

settingsDefaultBudget?.addEventListener("change", () => {
  saveSettings({ defaultBudget: parseFloat(settingsDefaultBudget.value) || 0.15 });
});

settingsTheme?.addEventListener("change", () => {
  const theme = settingsTheme.value;
  saveSettings({ theme });
  applyTheme(theme);
});

settingsNotifications?.addEventListener("change", async () => {
  if (settingsNotifications.checked) {
    const perm = await requestNotificationPermission();
    if (perm !== "granted") {
      settingsNotifications.checked = false;
      alert("Notification permission denied.");
      return;
    }
  }
  saveSettings({ notifications: settingsNotifications.checked });
});

exportCsvBtn?.addEventListener("click", () => {
  if (didToken) exportLedgerCsv(didToken);
});

copyDeliverableBtn?.addEventListener("click", async () => {
  if (!lastResult?.deliverable) return;
  await navigator.clipboard.writeText(lastResult.deliverable);
  copyDeliverableBtn.textContent = "Copied!";
  setTimeout(() => { copyDeliverableBtn.textContent = "Copy"; }, 2000);
});

downloadMdBtn?.addEventListener("click", () => {
  if (!lastResult?.deliverable) return;
  const blob = new Blob([lastResult.deliverable], { type: "text/markdown" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "deliverable.md";
  a.click();
  URL.revokeObjectURL(a.href);
});

downloadPdfBtn?.addEventListener("click", async () => {
  if (!lastResult?.deliverable) return;
  try {
    const { jsPDF } = await import("https://cdn.jsdelivr.net/npm/jspdf@2.5.2/+esm");
    const doc = new jsPDF();
    const lines = doc.splitTextToSize(lastResult.deliverable, 180);
    doc.setFont("courier");
    doc.setFontSize(10);
    doc.text(lines, 15, 20);
    doc.save("deliverable.pdf");
  } catch {
    alert("PDF export unavailable offline.");
  }
});

shareSummaryBtn?.addEventListener("click", async () => {
  if (!lastResult) return;
  const summary = `x402 Agent Run\nTotal: $${lastResult.totalUsdc.toFixed(4)} USDC\nSteps: ${lastResult.spend.length}\n\n${lastResult.deliverable.slice(0, 500)}…`;
  if (navigator.share) {
    await navigator.share({ title: "x402 deliverable", text: summary });
  } else {
    await navigator.clipboard.writeText(summary);
    shareSummaryBtn.textContent = "Copied!";
    setTimeout(() => { shareSummaryBtn.textContent = "Share summary"; }, 2000);
  }
});

goalInput?.addEventListener("input", () => {
  homeEmpty.hidden = Boolean(goalInput.value.trim());
});

const launchBudget = new URLSearchParams(window.location.search).get("budget");
if (launchBudget && budgetInput) {
  const parsed = parseFloat(launchBudget);
  if (Number.isFinite(parsed) && parsed > 0) budgetInput.value = String(parsed);
}

restoreSession();
