import { Magic } from "https://cdn.jsdelivr.net/npm/magic-sdk@33.9.0/+esm";
import { OAuthExtension } from "https://cdn.jsdelivr.net/npm/@magic-ext/oauth2@9.21.0/+esm";
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
import { fetchBalance, renderBalanceHtml, showFundModal, wireFundModal, pickDepositAddress, isSessionExpiredError, renderSessionExpiredHtml } from "./js/balance.js";
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
const googleLoginBtn = document.getElementById("google-login-btn");
const loginStatus = document.getElementById("login-status");
const logoutBtn = document.getElementById("logout-btn");
const walletLabel = document.getElementById("wallet-label");
const agentList = document.getElementById("agent-list");
const customAgentList = document.getElementById("custom-agent-list");
const customAgentsFieldset = document.getElementById("custom-agents-fieldset");
const saveAgentBtn = document.getElementById("save-agent-btn");
const goalInput = document.getElementById("goal");
const budgetInput = document.getElementById("budget");
const estimateBtn = document.getElementById("estimate-btn");
const estimateCard = document.getElementById("estimate-card");
const estimateProbedAt = document.getElementById("estimate-probed-at");
const estimateReasoning = document.getElementById("estimate-reasoning");
const estimateWarnings = document.getElementById("estimate-warnings");
const estimateSteps = document.getElementById("estimate-steps");
const estimateCatalog = document.getElementById("estimate-catalog");
const estimateCatalogList = document.getElementById("estimate-catalog-list");
const userToolPicksInput = document.getElementById("user-tool-picks");
const estimateTotal = document.getElementById("estimate-total");
const estimateBudgetWarn = document.getElementById("estimate-budget-warn");
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
const runErrorCard = document.getElementById("run-error-card");
const runErrorTitle = document.getElementById("run-error-title");
const runErrorMessage = document.getElementById("run-error-message");
const retryRunBtn = document.getElementById("retry-run-btn");
const errorHomeBtn = document.getElementById("error-home-btn");
const runningTitle = document.getElementById("running-title");
const runningSubtitle = document.getElementById("running-subtitle");
const resultSummary = document.getElementById("result-summary");
const receiptTotalInline = document.getElementById("receipt-total-inline");
const copyDeliverableBtn = document.getElementById("copy-deliverable-btn");
const followUpPanel = document.getElementById("follow-up-panel");
const followUpInput = document.getElementById("follow-up-input");
const followUpBtn = document.getElementById("follow-up-btn");
const followUpAnswer = document.getElementById("follow-up-answer");
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
const emptyBalanceDetails = document.getElementById("empty-balance-details");
const settingsWalletPanel = document.getElementById("settings-wallet-panel");
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
let lastBalances = null;
let userEmail = null;
let signingStep = null;
let currentView = "login";
let lastResult = null;
let runAborted = false;
let appConfig = null;
let lastEstimate = null;
let lastEstimateGoal = "";
let selectedCatalogPicks = new Set();

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
  const protectedViews = new Set([
    "dashboard", "home", "running", "result", "history", "analytics", "settings",
  ]);
  if (protectedViews.has(name) && !didToken) {
    name = "login";
  }
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

function openFundFlow() {
  if (lastBalances) showFundModal(lastBalances);
  else showFundModal(walletAddress);
}

function depositAddressNow() {
  if (lastBalances) return pickDepositAddress(lastBalances);
  return walletAddress;
}

function appendLog(line) {
  runLog.textContent += line + "\n";
  runLog.scrollTop = runLog.scrollHeight;
}

function updateBudgetBar(spent, cap, remaining) {
  const pct = cap > 0 ? Math.min(100, (spent / cap) * 100) : 0;
  budgetFill.style.width = pct + "%";
  const left = remaining !== undefined ? remaining : Math.max(0, cap - spent);
  budgetLabel.textContent = `$${spent.toFixed(2)} spent · $${left.toFixed(2)} remaining`;
}

function statusLabel(state) {
  switch (state) {
    case "queued": return "Waiting";
    case "paying": return "Running…";
    case "signing": return "Confirming…";
    case "paid": return "Done";
    case "settled": return "Complete";
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

function stepLabel(step) {
  return step.label ?? step.service;
}

function resolveStepMeta(label) {
  if (SERVICE_META[label]) return SERVICE_META[label];
  const key = Object.keys(SERVICE_META).find((k) => label.toLowerCase().includes(k));
  if (key) return SERVICE_META[key];
  return { label, icon: "⚡", chain: "base", blurb: "Working on this step" };
}

function createStepCard(label) {
  const meta = resolveStepMeta(label);
  const card = document.createElement("div");
  card.className = "timeline-step timeline-step--queued";
  card.dataset.service = label;
  card.innerHTML = `
    <div class="timeline-icon" aria-hidden="true">${meta.icon}</div>
    <div class="timeline-body">
      <h4>${escapeHtml(meta.label)}</h4>
      <p>${escapeHtml(meta.blurb)}</p>
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
    if (txEl && url) txEl.innerHTML = txChipHtml(url, "Receipt ↗", variant);
  }
}

function buildTimelineFromPlan(plan) {
  runTimeline.innerHTML = "";
  stepState.clear();
  for (const step of plan.steps) {
    const key = stepLabel(step);
    const card = createStepCard(key);
    runTimeline.appendChild(card);
    stepState.set(key, { el: card, state: "queued" });
  }
}

function showUaTopup(event) {
  uaTopupCard.hidden = false;
  uaTopupAmount.textContent = `+$${Number(event.amountUsdc).toFixed(2)}`;
  const trackUrl = `https://universalx.app/activity/details?id=${encodeURIComponent(event.transactionId)}`;
  uaTopupLink.href = trackUrl;
  uaTopupLink.hidden = false;
  uaTopupLink.textContent = "Details";
}

function hideRunError() {
  runErrorCard.hidden = true;
}

function showRunError(message, { stopped = false } = {}) {
  runErrorCard.hidden = false;
  runErrorTitle.textContent = stopped ? "Run stopped" : isInsufficientFunds(message) ? "Add funds to continue" : "Something went wrong";
  runErrorMessage.textContent = message;
  if (isInsufficientFunds(message)) {
    runErrorMessage.innerHTML = `${escapeHtml(message)}<br><br><button type="button" class="btn btn-secondary btn-sm" id="error-fund-btn">Add funds</button>`;
    document.getElementById("error-fund-btn")?.addEventListener("click", () => openFundFlow());
  }
  runningTitle.textContent = stopped ? "Run stopped" : "Run ended";
  runningSubtitle.textContent = stopped
    ? "No further steps will run."
    : "Review the message below and try again when ready.";
}

function resetRunUi(budget) {
  runLog.textContent = "";
  runTimeline.innerHTML = "";
  stepState.clear();
  signingStep = null;
  runAborted = false;
  uaTopupCard.hidden = true;
  hideRunError();
  runningTitle.textContent = "Working on your request…";
  runningSubtitle.textContent = "This usually takes under a minute.";
  updateBudgetBar(0, budget);
}

async function initMagic() {
  const res = await fetch("/api/config");
  if (!res.ok) throw new Error(`Config failed (${res.status})`);
  appConfig = await res.json();
  if (!appConfig.magicPublishableKey) throw new Error("Missing Magic publishable key");
  magic = new Magic(appConfig.magicPublishableKey, {
    network: appConfig.magicNetwork ?? "ethereum",
    extensions: [new OAuthExtension()],
  });
}

function oauthRedirectUri() {
  return `${window.location.origin}/app`;
}

async function handleOAuthRedirect() {
  if (!magic?.oauth2) return false;
  try {
    const result = await magic.oauth2.getRedirectResult();
    if (result?.magic?.idToken) {
      didToken = result.magic.idToken;
      return true;
    }
  } catch {
    // No pending OAuth redirect — normal page load.
  }
  return false;
}

async function loginWithGoogle() {
  if (!magic) await initMagic();
  loginStatus.textContent = "Redirecting to Google…";
  await magic.oauth2.loginWithRedirect({
    provider: "google",
    redirectURI: oauthRedirectUri(),
  });
}

function resolveWalletAddress(meta) {
  return meta?.wallets?.ethereum?.publicAddress ?? meta?.publicAddress ?? null;
}

async function loadUserSession() {
  // Always pull a fresh DID — Magic tokens expire; caching one breaks balance/history mid-session.
  didToken = await magic.user.getIdToken();
  const meta = await magic.user.getInfo();
  walletAddress = resolveWalletAddress(meta);
  if (!walletAddress) throw new Error("Account is missing a wallet address");
  userEmail = meta.email ?? null;
  const label = userEmail || `Account · ${shortAddr(walletAddress)}`;
  walletLabel.textContent = label;
  if (dashWalletLabel) dashWalletLabel.textContent = label;
  if (appNav) appNav.hidden = false;
  const back = document.getElementById("app-back-link");
  if (back) back.hidden = true;
}

/** Refresh Magic DID before authenticated API calls. */
async function ensureFreshDidToken() {
  if (!magic) await initMagic();
  const loggedIn = await magic.user.isLoggedIn();
  if (!loggedIn) {
    didToken = null;
    throw new Error("SESSION_EXPIRED");
  }
  didToken = await magic.user.getIdToken();
  return didToken;
}

async function refreshBalances(targetEl) {
  if (!targetEl) return;
  targetEl.innerHTML = "<p class='empty-hint'>Loading balances…</p>";
  try {
    await ensureFreshDidToken();
    const balances = await fetchBalance(didToken);
    lastBalances = balances;
    targetEl.innerHTML = renderBalanceHtml(balances);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "SESSION_EXPIRED" || isSessionExpiredError(message)) {
      lastBalances = null;
      targetEl.innerHTML = renderSessionExpiredHtml();
      return;
    }
    targetEl.innerHTML = `<p class="empty-hint">${escapeHtml(message)}</p>`;
  }
}

async function refreshDashboard() {
  try {
    await ensureFreshDidToken();
  } catch {
    showView("login");
    return;
  }
  try {
    const [history, analytics] = await Promise.all([
      fetchHistory(didToken),
      fetchAnalytics(didToken),
    ]);
    const hasRuns = history.length > 0;
    dashboardEmpty.hidden = hasRuns;
    dashboardContent.hidden = !hasRuns;
    if (!hasRuns) {
      // First-time users: Add funds used to live only in dashboard-content (hidden).
      await refreshBalances(emptyBalanceDetails);
      return;
    }

    dashCumulative.textContent = formatUsdc(analytics.cumulativeSpend);
    dashRunCount.textContent = `${analytics.totalRuns} task${analytics.totalRuns === 1 ? "" : "s"}`;
    renderHistoryList(recentRunsList, history.slice(0, 5), { compact: true });
    wireHistoryButtons(recentRunsList);

    if (analytics.recentOverBudget > 0) {
      overageBanner.hidden = false;
      overageBannerText.textContent = `${analytics.recentOverBudget} recent task(s) spent more than the run limit.`;
    } else {
      overageBanner.hidden = true;
    }

    await refreshBalances(balanceDetails);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    dashboardEmpty.hidden = false;
    dashboardContent.hidden = true;
    if (isSessionExpiredError(message)) {
      dashboardEmpty.querySelector("p").textContent = "Session expired — sign in again.";
      return;
    }
    dashboardEmpty.querySelector("p").textContent = message;
  }
}

async function refreshHome() {
  try {
    await ensureFreshDidToken();
  } catch {
    showView("login");
    return;
  }
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
  try {
    await ensureFreshDidToken();
  } catch {
    showView("login");
    return;
  }
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
  try {
    await ensureFreshDidToken();
  } catch {
    showView("login");
    return;
  }
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
  const budget = Number(settings.defaultBudget ?? 0.15);
  settingsDefaultBudget.value = Number.isFinite(budget) ? budget.toFixed(2) : "0.15";
  settingsTheme.value = settings.theme ?? "light";
  settingsNotifications.checked = Boolean(settings.notifications);

  if (didToken && settingsWalletPanel) {
    await refreshBalances(settingsWalletPanel);
  }

  try {
    const res = await fetch("/api/health");
    const data = await res.json();
    settingsNetwork.textContent = data.network === "mainnet"
      ? "Production"
      : "Test environment";
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
    btn.innerHTML = `<strong>${agent.name}</strong><span>${agent.description} · from ~$${agent.suggestedBudget}</span>`;
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
    btn.innerHTML = `<strong>${escapeHtml(agent.name)}</strong><span>${escapeHtml(agent.description || "Custom task")} · from ~$${agent.suggestedBudget}</span>`;
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
  hideEstimate();
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

  const totalStr = `$${result.totalUsdc.toFixed(2)}`;
  if (resultSummary) {
    resultSummary.textContent = `${result.spend.length} step${result.spend.length === 1 ? "" : "s"} · ${totalStr} total`;
  }
  if (receiptTotalInline) receiptTotalInline.textContent = totalStr;

  deliverableEl.innerHTML = renderMarkdown(result.deliverable);
  spendBody.innerHTML = "";
  for (const line of result.spend) {
    const tr = document.createElement("tr");
    const url = explorerUrlForPayment(line);
    const txCell = url
      ? `<a class="spend-tx-link" href="${url}" target="_blank" rel="noopener">Receipt ↗</a>`
      : "—";
    tr.innerHTML = `<td>${escapeHtml(line.service)}</td><td class="spend-amount">${formatUsdc(line.usdc)}</td><td>${txCell}</td>`;
    spendBody.appendChild(tr);
  }
  totalSpent.innerHTML = `<strong class="total-spent-amount">${totalStr}</strong>`;
  if (followUpAnswer) {
    followUpAnswer.hidden = true;
    followUpAnswer.innerHTML = "";
  }
  if (followUpInput) followUpInput.value = "";
  showView("result");
}

async function sendFollowUp() {
  if (!lastResult?.deliverable) return;
  const question = followUpInput?.value?.trim();
  if (!question) {
    alert("Enter a follow-up question.");
    return;
  }
  followUpBtn.disabled = true;
  followUpBtn.textContent = "Thinking…";
  try {
    const res = await fetch("/api/follow-up", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        question,
        goal: lastResult.goal ?? lastEstimateGoal ?? goalInput.value.trim(),
        deliverable: lastResult.deliverable,
        toolContext: lastResult.toolContext ?? [],
        spend: lastResult.spend,
      }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error ?? `Follow-up failed (${res.status})`);
    }
    const data = await res.json();
    followUpAnswer.hidden = false;
    followUpAnswer.innerHTML = renderMarkdown(data.answer);
    if (data.thoughts) {
      followUpAnswer.innerHTML +=
        `<details class="follow-up-thoughts"><summary>Model thinking</summary><pre>${escapeHtml(data.thoughts)}</pre></details>`;
    }
  } catch (err) {
    alert(`Follow-up failed: ${err.message}`);
  } finally {
    followUpBtn.disabled = false;
    followUpBtn.textContent = "Ask follow-up";
  }
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

function hideEstimate() {
  if (estimateCard) estimateCard.hidden = true;
  if (runBtn) {
    runBtn.hidden = true;
    runBtn.disabled = false;
  }
  if (estimateBudgetWarn) {
    estimateBudgetWarn.hidden = true;
    estimateBudgetWarn.textContent = "";
  }
  lastEstimate = null;
  lastEstimateGoal = "";
}

function parseUserToolPicks() {
  const picks = new Set(selectedCatalogPicks);
  const raw = userToolPicksInput?.value?.trim();
  if (raw) {
    for (const s of raw.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean)) {
      picks.add(s);
    }
  }
  return [...picks];
}

function renderCatalogPicker(catalog) {
  if (!estimateCatalog || !estimateCatalogList || !catalog?.length) {
    if (estimateCatalog) estimateCatalog.hidden = true;
    return;
  }
  estimateCatalog.hidden = false;
  estimateCatalogList.innerHTML = catalog
    .slice(0, 16)
    .map((t) => {
      const price = t.probeUsdc ?? t.catalogUsdc;
      const priceStr = price != null ? `$${price.toFixed(4)}` : "?";
      const checked = selectedCatalogPicks.has(t.displayName) || selectedCatalogPicks.has(t.mcpToolName);
      return `<li>
        <label class="catalog-pick">
          <input type="checkbox" class="catalog-pick-cb" data-name="${escapeHtml(t.displayName)}" data-mcp="${escapeHtml(t.mcpToolName)}" ${checked ? "checked" : ""} />
          <span class="catalog-pick-name">${escapeHtml(t.displayName)}</span>
          <span class="catalog-pick-price">${priceStr}</span>
        </label>
      </li>`;
    })
    .join("");

  estimateCatalogList.querySelectorAll(".catalog-pick-cb").forEach((cb) => {
    cb.addEventListener("change", () => {
      const name = cb.dataset.name;
      const mcp = cb.dataset.mcp;
      if (cb.checked) {
        if (name) selectedCatalogPicks.add(name);
        if (mcp) selectedCatalogPicks.add(mcp);
      } else {
        if (name) selectedCatalogPicks.delete(name);
        if (mcp) selectedCatalogPicks.delete(mcp);
      }
    });
  });
}

function syncRunBudgetFromEstimate(estimate) {
  budgetInput.value = String(estimate.suggestedBudget);
  if (!estimateBudgetWarn) return;
  if (estimate.suggestedBudget < estimate.totalEstUsdc) {
    estimateBudgetWarn.hidden = false;
    estimateBudgetWarn.textContent = "Estimated cost exceeds the run limit. Check price again or raise your default limit in Settings.";
    runBtn.disabled = true;
  } else {
    estimateBudgetWarn.hidden = true;
    estimateBudgetWarn.textContent = "";
    runBtn.disabled = false;
  }
}

function renderEstimate(estimate) {
  lastEstimate = estimate;
  lastEstimateGoal = estimate.goal;
  syncRunBudgetFromEstimate(estimate);

  const stepCount = estimate.plan.steps.length;
  estimateProbedAt.textContent = `Price checked ${new Date(estimate.probedAt).toLocaleString()} · ${stepCount} step${stepCount === 1 ? "" : "s"}`;

  if (estimateReasoning) {
    const parts = [];
    if (estimate.needs?.length) {
      parts.push(`<p><strong>Needs:</strong> ${estimate.needs.map(escapeHtml).join(", ")}</p>`);
    }
    if (estimate.reasoning) {
      parts.push(`<p><strong>Reasoning:</strong> ${escapeHtml(estimate.reasoning)}</p>`);
    }
    if (estimate.thoughts) {
      parts.push(`<details class="estimate-thoughts-wrap"><summary>How the planner decided</summary><pre class="estimate-thoughts">${escapeHtml(estimate.thoughts)}</pre></details>`);
    }
    estimateReasoning.innerHTML = parts.join("");
    estimateReasoning.hidden = parts.length === 0;
  }

  if (estimateWarnings) {
    if (estimate.warnings?.length) {
      estimateWarnings.innerHTML = estimate.warnings
        .map(
          (w) =>
            `<div class="estimate-warning"><strong>${escapeHtml(w.issue)}</strong><p>${escapeHtml(w.reason)}</p>` +
            (w.alternatives?.length
              ? `<p>Alternatives: ${w.alternatives.map(escapeHtml).join(", ")}</p>`
              : "") +
            `</div>`,
        )
        .join("");
      estimateWarnings.hidden = false;
    } else {
      estimateWarnings.innerHTML = "";
      estimateWarnings.hidden = true;
    }
  }

  estimateSteps.innerHTML =
    estimate.plan.steps
      .map((step) => {
        const label = stepLabel(step);
        const why = step.why ? `<p class="plan-step-why">${escapeHtml(step.why)}</p>` : "";
        return `<div class="plan-step-row"><span>${escapeHtml(label)}</span><span>$${step.estCostUsdc.toFixed(4)}</span></div>${why}`;
      })
      .join("") +
    `<div class="plan-step-row plan-step-row--total"><span>Estimated total</span><span>$${estimate.totalEstUsdc.toFixed(4)}</span></div>`;

  renderCatalogPicker(estimate.catalog);

  estimateTotal.innerHTML = `Estimated total: <strong>${formatUsdc(estimate.totalEstUsdc)}</strong> · run limit <strong>${formatUsdc(estimate.suggestedBudget)}</strong>`;
  estimateCard.hidden = false;
  runBtn.hidden = false;
}

async function fetchEstimate() {
  try {
    await ensureFreshDidToken();
  } catch {
    alert("Please sign in first.");
    showView("login");
    return;
  }
  const goal = goalInput.value.trim();
  if (!goal) {
    alert("Please enter a goal or pick a template.");
    return;
  }

  estimateBtn.disabled = true;
  estimateBtn.textContent = "Planning…";
  hideEstimate();

  const userToolPicks = parseUserToolPicks();

  try {
    const res = await fetch("/api/estimate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ goal, userToolPicks }),
    });
    if (!res.ok) {
      const err = await res.json();
      const hint = err.suggestion ? `\n\n${err.suggestion}` : "";
      throw new Error((err.error ?? `Estimate failed (${res.status})`) + hint);
    }
    const estimate = await res.json();
    renderEstimate(estimate);
  } catch (err) {
    alert(`Estimate failed: ${err.message}`);
  } finally {
    estimateBtn.disabled = false;
    estimateBtn.textContent = "Check price & plan →";
  }
}

async function startRun() {
  try {
    await ensureFreshDidToken();
  } catch {
    alert("Please sign in first.");
    showView("login");
    return;
  }

  const goal = goalInput.value.trim();
  if (!goal) {
    alert("Please enter a goal or pick a template.");
    return;
  }
  if (!lastEstimate?.plan) {
    alert("Check the price and plan before starting a run.");
    return;
  }

  const budget = lastEstimate.suggestedBudget;
  if (budget < lastEstimate.plan.totalEstUsdc) {
    alert(`Estimated cost is ${formatUsdc(lastEstimate.plan.totalEstUsdc)}. Check price again or raise your default limit in Settings.`);
    return;
  }
  budgetInput.value = String(budget);

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
      body: JSON.stringify({
        goal,
        budget,
        stream: true,
        didToken,
        userToolPicks: parseUserToolPicks(),
        approvedPlan: lastEstimate?.plan,
      }),
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
        } else if (event.type === "ua_topup") {
          showUaTopup(event);
          appendLog(`[ua] cross-chain top-up $${event.amountUsdc} id=${event.transactionId}`);
        } else if (event.type === "step_start") {
          activeStep = stepLabel(event.step);
          setStepState(activeStep, "paying");
          appendLog(`> ${activeStep}…`);
        } else if (event.type === "payment") {
          spent += event.line.usdc;
          updateBudgetBar(spent, runBudget, event.remaining);
          setStepState(event.line.service, "paid", event.line);
          activeStep = null;
          appendLog(`  paid $${event.line.usdc.toFixed(6)} tx=${event.line.txHash} · $${event.remaining.toFixed(4)} left`);
        } else if (event.type === "step_done") {
          setStepState(stepLabel(event.step), "settled");
          appendLog(`  ✓ ${stepLabel(event.step)} settled`);
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

  const oauthHandled = await handleOAuthRedirect();
  if (oauthHandled) {
    await loadUserSession();
    loginStatus.textContent = "";
    showView("dashboard");
    await loadAgents();
    wireFundModal(copyFundAddress, depositAddressNow);
    return;
  }

  const loggedIn = await magic.user.isLoggedIn();
  if (!loggedIn) {
    showView("login");
    return;
  }
  await loadUserSession();
  showView("dashboard");
  await loadAgents();
  wireFundModal(copyFundAddress, depositAddressNow);
}

loginBtn.addEventListener("click", async () => {
  const email = emailInput.value.trim();
  if (!email) {
    loginStatus.textContent = "Enter your email.";
    return;
  }
  loginBtn.disabled = true;
  loginStatus.textContent = "Check your email for the code…";
  try {
    if (!magic) await initMagic();
    await magic.auth.loginWithEmailOTP({ email, showUI: true });
    await loadUserSession();
    loginStatus.textContent = "";
    showView("dashboard");
    await loadAgents();
    wireFundModal(copyFundAddress, depositAddressNow);
  } catch (err) {
    loginStatus.textContent = `Sign in failed: ${err.message}`;
  } finally {
    loginBtn.disabled = false;
  }
});

googleLoginBtn?.addEventListener("click", async () => {
  googleLoginBtn.disabled = true;
  try {
    await loginWithGoogle();
  } catch (err) {
    loginStatus.textContent = `Google sign in failed: ${err.message}`;
    googleLoginBtn.disabled = false;
  }
});

async function logout() {
  if (magic) await magic.user.logout();
  didToken = null;
  walletAddress = null;
  lastBalances = null;
  if (appNav) appNav.hidden = true;
  const back = document.getElementById("app-back-link");
  if (back) back.hidden = false;
  showView("login");
}

logoutBtn.addEventListener("click", logout);
dashLogoutBtn?.addEventListener("click", logout);
settingsLogoutBtn?.addEventListener("click", logout);

estimateBtn?.addEventListener("click", fetchEstimate);
runBtn.addEventListener("click", startRun);
retryRunBtn?.addEventListener("click", () => {
  if (goalInput.value.trim() === lastEstimateGoal && lastEstimate) startRun();
  else fetchEstimate().then(() => { if (lastEstimate) startRun(); });
});
errorHomeBtn?.addEventListener("click", () => showView("home"));

stopBtn.addEventListener("click", async () => {
  runAborted = true;
  stopBtn.disabled = true;
  stopBtn.textContent = "Stopping…";
  await fetch("/run/stop", { method: "POST" });
  appendLog("Stop requested.");
  stopBtn.disabled = false;
  stopBtn.textContent = "Stop";
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
fundWalletBtn?.addEventListener("click", () => openFundFlow());

// Add funds / copy address — buttons are rendered dynamically in balance HTML
document.addEventListener("click", async (ev) => {
  const btn = ev.target?.closest?.("[data-action]");
  if (!btn) return;
  const action = btn.dataset.action;
  if (action === "add-funds") {
    ev.preventDefault();
    openFundFlow();
    return;
  }
  if (action === "relogin") {
    ev.preventDefault();
    await logout();
    return;
  }
  if (action === "copy-deposit") {
    ev.preventDefault();
    const addr = btn.dataset.address || depositAddressNow();
    if (!addr) return;
    try {
      await navigator.clipboard.writeText(addr);
      const prev = btn.textContent;
      btn.textContent = "Copied!";
      setTimeout(() => { btn.textContent = prev; }, 2000);
    } catch {
      alert(addr);
    }
  }
});

document.getElementById("magic-wallet-ui-btn")?.addEventListener("click", async () => {
  // Kept only if a future screen re-adds #magic-wallet-ui-btn.
  // Native <dialog> top-layer always covers Magic's iframe — never open showUI from inside fund-modal.
  const fundModal = document.getElementById("fund-modal");
  if (fundModal?.open) fundModal.close();
  try {
    if (!magic) await initMagic();
    await magic.wallet.showUI();
  } catch (err) {
    alert(err?.message ?? "Magic wallet UI unavailable");
  }
});

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

followUpBtn?.addEventListener("click", sendFollowUp);

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
  const summary = `Research Agent\nTotal: ${formatUsdc(lastResult.totalUsdc)}\n\n${lastResult.deliverable.slice(0, 500)}…`;
  if (navigator.share) {
    await navigator.share({ title: "Research report", text: summary });
  } else {
    await navigator.clipboard.writeText(summary);
    shareSummaryBtn.textContent = "Copied!";
    setTimeout(() => { shareSummaryBtn.textContent = "Share summary"; }, 2000);
  }
});

goalInput?.addEventListener("input", () => {
  homeEmpty.hidden = Boolean(goalInput.value.trim());
  if (goalInput.value.trim() !== lastEstimateGoal) hideEstimate();
});

const launchBudget = new URLSearchParams(window.location.search).get("budget");
if (launchBudget && budgetInput) {
  const parsed = parseFloat(launchBudget);
  if (Number.isFinite(parsed) && parsed > 0) budgetInput.value = String(parsed);
}

restoreSession();
