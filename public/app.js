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
} from "./js/utils.js";
import { renderDeliverable } from "./js/report-renderer.js";
import {
  clampRunBudget,
  comfortableRunBudget,
  DEFAULT_RUN_BUDGET_USDC,
  evaluateRunBudget,
  formatBudget,
  MAX_RUN_BUDGET_USDC,
  MIN_RUN_BUDGET_USDC,
  minimumRunBudget,
  parseRunBudgetInput,
  recommendedRunBudget,
} from "./js/budget.js";
import { fetchBalance, renderBalanceHtml, renderDepositPanelHtml, showFundModal, wireFundModal, pickDepositAddress, pickAvailableCredit, isSessionExpiredError, renderSessionExpiredHtml } from "./js/balance.js";
import { closeDialogsBeforeMagicUi } from "./js/magic-ui.js";
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
import { showToast } from "./js/toast.js";
import {
  parseRoute,
  consumeReturnPath,
  syncHistory,
  initRouter,
  isProtectedView,
  DEFAULT_ENTRY_VIEW,
  resolveEntryRoute,
  RETURN_PATH_KEY,
} from "./js/router.js";

const APP_BRAND = "x402 // Orchestrator";

const VIEW_TAB_LABELS = {
  home: "Home",
  running: "Running",
  result: "Output",
  history: "History",
  analytics: "Billing",
  settings: "Settings",
};

function setDocumentTitle(view) {
  const label = VIEW_TAB_LABELS[view];
  document.title = label ? `${label} · ${APP_BRAND}` : APP_BRAND;
}

const views = {
  home: document.getElementById("view-home"),
  running: document.getElementById("view-running"),
  result: document.getElementById("view-result"),
  history: document.getElementById("view-history"),
  analytics: document.getElementById("view-analytics"),
  settings: document.getElementById("view-settings"),
};

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
const budgetControl = document.getElementById("budget-control");
const runBudgetInput = document.getElementById("run-budget-input");
const budgetEstCost = document.getElementById("budget-est-cost");
const budgetPresetMin = document.getElementById("budget-preset-min");
const budgetPresetRec = document.getElementById("budget-preset-rec");
const budgetPresetComfort = document.getElementById("budget-preset-comfort");
const budgetCapEstFill = document.getElementById("budget-cap-est-fill");
const budgetCapLimitFill = document.getElementById("budget-cap-limit-fill");
const budgetControlStatus = document.getElementById("budget-control-status");
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
const settingsAccountEmail = document.getElementById("settings-account-email");
const logoutModal = document.getElementById("logout-modal");
const logoutConfirmBtn = document.getElementById("logout-confirm-btn");

let magic = null;
let didToken = null;
let walletAddress = null;
let lastBalances = null;
let userEmail = null;
let signingStep = null;
let currentView = DEFAULT_ENTRY_VIEW;
let lastResult = null;
let runAborted = false;
let appConfig = null;
let lastEstimate = null;
let lastEstimateGoal = "";
let activeBudgetPreset = "recommended";
let pendingLaunchBudget = null;
let selectedCatalogPicks = new Set();
let lastResultRunId = null;

const stepState = new Map();

function redirectUnauthorized() {
  window.location.replace("/404.html");
}

function redirectToLogin() {
  window.location.href = "/?open=login";
}

function updateAuthUi() {
  const authed = Boolean(didToken);
  if (appNav) appNav.hidden = !authed;
}

async function requireAuth() {
  if (didToken) {
    try {
      await ensureFreshDidToken();
      return true;
    } catch {
      didToken = null;
      updateAuthUi();
    }
  }
  redirectUnauthorized();
  return false;
}

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

function isAuthed() {
  return Boolean(didToken);
}

function showView(name, { updateUrl = true, historyMode = "push", runId = null } = {}) {
  if (!isAuthed()) {
    redirectUnauthorized();
    return;
  }
  if (name === "dashboard") name = "home";
  setDocumentTitle(name);
  currentView = name;
  for (const [key, el] of Object.entries(views)) {
    if (!el) continue;
    el.classList.toggle("active", key === name);
    el.hidden = key !== name;
  }
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.classList.toggle("nav-btn--active", btn.dataset.view === name);
  });
  if (name === "home") refreshHome();
  if (name === "history") refreshHistory();
  if (name === "analytics") refreshAnalytics();
  if (name === "settings") refreshSettings();

  if (!updateUrl) return;

  if (name === "running") {
    syncHistory("running", { mode: "replace" });
  } else {
    syncHistory(name, {
      runId: name === "result" ? (runId ?? lastResultRunId) : null,
      mode: historyMode,
    });
  }
}

async function applyRoute(route, { fromPopstate = false } = {}) {
  if (!isAuthed()) {
    redirectUnauthorized();
    return;
  }

  let { view, runId } = route;

  if (!view) {
    view = DEFAULT_ENTRY_VIEW;
  }

  if (view === "running" && currentView !== "running") {
    showView("home", { updateUrl: !fromPopstate, historyMode: "replace" });
    return;
  }

  if (view === "result") {
    if (runId && didToken) {
      try {
        const run = await fetchRun(didToken, runId);
        renderResult(
          {
            deliverable: run.deliverable,
            document: run.document,
            spend: run.spend,
            totalUsdc: run.totalUsdc,
            uaTopUpTxId: run.uaTopUpTxId,
            goal: run.goal,
          },
          { runId, updateUrl: false },
        );
        if (!fromPopstate) {
          syncHistory("result", { runId, mode: "replace" });
        }
        return;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        showToast(`Could not load output: ${message}`, { type: "error" });
        view = "history";
        runId = null;
      }
    } else if (lastResult) {
      showView("result", {
        runId: lastResultRunId,
        updateUrl: !fromPopstate,
        historyMode: fromPopstate ? "none" : "replace",
      });
      return;
    } else {
      showToast("Output not available — open it from History.", { type: "info" });
      view = DEFAULT_ENTRY_VIEW;
      runId = null;
    }
  }

  showView(view, {
    runId,
    updateUrl: !fromPopstate,
    historyMode: fromPopstate ? "none" : "replace",
  });
}

function applyBudgetFromSearch(search) {
  if (!search) return;
  const parsed = parseRunBudgetInput(new URLSearchParams(search).get("budget"));
  if (parsed != null) pendingLaunchBudget = parsed;
}

function getWalletCredit() {
  if (!lastBalances) return null;
  return pickAvailableCredit(lastBalances);
}

function getSelectedRunBudget() {
  const fromInput = parseRunBudgetInput(runBudgetInput?.value ?? budgetInput?.value);
  return fromInput ?? DEFAULT_RUN_BUDGET_USDC;
}

function setRunBudgetValue(usdc, { preset = null } = {}) {
  const clamped = clampRunBudget(usdc);
  if (runBudgetInput) runBudgetInput.value = clamped.toFixed(2);
  if (budgetInput) budgetInput.value = String(clamped);
  if (preset) activeBudgetPreset = preset;
  document.querySelectorAll("[data-budget-preset]").forEach((btn) => {
    btn.classList.toggle("budget-preset--active", btn.dataset.budgetPreset === activeBudgetPreset);
  });
  refreshBudgetControlStatus();
}

function updateBudgetCapVisual(estimatedCost, runLimit) {
  if (!budgetCapEstFill || !budgetCapLimitFill) return;
  const est = Number(estimatedCost) || 0;
  const limit = Number(runLimit) || DEFAULT_RUN_BUDGET_USDC;
  const scale = Math.max(est, limit, 0.01);
  const estPct = est > 0 ? Math.min(100, (est / scale) * 100) : 0;
  const limitPct = Math.min(100, (limit / scale) * 100);
  budgetCapEstFill.style.width = `${estPct}%`;
  budgetCapLimitFill.style.width = `${limitPct}%`;
}

function refreshBudgetControlStatus() {
  if (!lastEstimate?.plan || !budgetControlStatus) return;
  const est = lastEstimate.plan.totalEstUsdc;
  const limit = getSelectedRunBudget();
  const result = evaluateRunBudget({
    runLimit: limit,
    estimatedCost: est,
    walletCredit: getWalletCredit(),
  });

  budgetControlStatus.textContent = result.message;
  budgetControlStatus.className = `budget-control-status budget-control-status--${result.state}`;

  if (estimateBudgetWarn) {
    estimateBudgetWarn.hidden = true;
    estimateBudgetWarn.textContent = "";
  }

  if (runBtn) {
    runBtn.disabled = !result.canRun;
    runBtn.textContent = result.canRun
      ? `Start run · ${formatBudget(limit)} limit →`
      : "Raise limit to continue";
  }
  updateBudgetCapVisual(est, limit);
}

function applyBudgetPreset(preset) {
  if (!lastEstimate?.plan) return;
  const est = lastEstimate.plan.totalEstUsdc;
  let value = recommendedRunBudget(est);
  if (preset === "minimum") value = minimumRunBudget(est);
  else if (preset === "comfortable") value = comfortableRunBudget(est);
  else if (preset === "recommended") value = recommendedRunBudget(est);
  setRunBudgetValue(value, { preset });
}

function renderBudgetControl(estimate) {
  if (!budgetControl || !runBudgetInput) return;

  const est = estimate.plan.totalEstUsdc;
  const min = minimumRunBudget(est);
  const rec = recommendedRunBudget(est);
  const comfort = comfortableRunBudget(est);

  if (budgetEstCost) budgetEstCost.textContent = formatBudget(est);
  if (budgetPresetMin) budgetPresetMin.textContent = formatBudget(min);
  if (budgetPresetRec) budgetPresetRec.textContent = formatBudget(rec);
  if (budgetPresetComfort) budgetPresetComfort.textContent = formatBudget(comfort);

  runBudgetInput.min = String(MIN_RUN_BUDGET_USDC);
  runBudgetInput.max = String(MAX_RUN_BUDGET_USDC);

  const settings = loadSettings();
  const defaultBudget = parseRunBudgetInput(settings.defaultBudget) ?? DEFAULT_RUN_BUDGET_USDC;
  const launchBudget = pendingLaunchBudget != null ? pendingLaunchBudget : null;
  pendingLaunchBudget = null;

  let initial = rec;
  if (launchBudget != null && launchBudget >= min) initial = launchBudget;
  else if (defaultBudget >= min) initial = Math.max(defaultBudget, rec);

  const preset =
    Math.abs(initial - min) < 0.005
      ? "minimum"
      : Math.abs(initial - comfort) < 0.005
        ? "comfortable"
        : "recommended";

  setRunBudgetValue(initial, { preset });
  budgetControl.hidden = false;
}

function wireBudgetControl() {
  runBudgetInput?.addEventListener("input", () => {
    activeBudgetPreset = "custom";
    document.querySelectorAll("[data-budget-preset]").forEach((btn) => {
      btn.classList.toggle("budget-preset--active", false);
    });
    refreshBudgetControlStatus();
  });

  runBudgetInput?.addEventListener("change", () => {
    const parsed = parseRunBudgetInput(runBudgetInput.value);
    if (parsed == null) {
      showToast("Enter a valid limit between $0.01 and $5.00 USDC.", { type: "warning" });
      if (lastEstimate?.plan) setRunBudgetValue(recommendedRunBudget(lastEstimate.plan.totalEstUsdc), { preset: "recommended" });
      return;
    }
    setRunBudgetValue(parsed);
  });

  document.querySelectorAll("[data-budget-preset]").forEach((btn) => {
    btn.addEventListener("click", () => applyBudgetPreset(btn.dataset.budgetPreset));
  });
}

function openFundFlow() {
  requireAuth().then((ok) => {
    if (!ok) return;
    if (lastBalances) showFundModal(lastBalances);
    else showFundModal(walletAddress);
  });
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
  if (step?.kind === "compose" || step?.kind === "synthesize") {
    return step.label || "Build deliverable (deterministic)";
  }
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
  if (settingsAccountEmail) {
    settingsAccountEmail.textContent = userEmail ?? "—";
  }
  updateAuthUi();
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
    if (lastEstimate?.plan) refreshBudgetControlStatus();
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

async function refreshHome() {
  if (!didToken) return;
  const settings = loadSettings();
  if (settings.defaultBudget && budgetInput) {
    budgetInput.value = String(settings.defaultBudget);
  }
  homeEmpty.hidden = Boolean(goalInput?.value.trim());
  try {
    await ensureFreshDidToken();
  } catch {
    didToken = null;
    updateAuthUi();
    redirectToLogin();
    return;
  }
  await loadAgents();
  await loadCustomAgents();

  try {
    const [history, analytics] = await Promise.all([
      fetchHistory(didToken),
      fetchAnalytics(didToken),
    ]);
    const hasRuns = history.length > 0;
    dashboardEmpty.hidden = hasRuns;
    dashboardContent.hidden = !hasRuns;
    if (!hasRuns) {
      await refreshBalances(emptyBalanceDetails);
      return;
    }

    dashCumulative.textContent = formatUsdc(analytics.cumulativeSpend);
    dashRunCount.textContent = `${analytics.totalRuns} task${analytics.totalRuns === 1 ? "" : "s"}`;

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
      dashboardEmpty.querySelector("p").textContent = "Session expired — open Settings to sign in again.";
      return;
    }
    dashboardEmpty.querySelector("p").textContent = message;
  }
}

async function refreshHistory() {
  if (!didToken) {
    historyEmpty.hidden = false;
    historyList.innerHTML = "";
    return;
  }
  try {
    await ensureFreshDidToken();
  } catch {
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
  if (!didToken) {
    analyticsEmpty.hidden = false;
    analyticsContent.hidden = true;
    return;
  }
  try {
    await ensureFreshDidToken();
  } catch {
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
  const budget = parseRunBudgetInput(settings.defaultBudget) ?? DEFAULT_RUN_BUDGET_USDC;
  settingsDefaultBudget.value = budget.toFixed(2);
  settingsDefaultBudget.min = String(MIN_RUN_BUDGET_USDC);
  settingsDefaultBudget.max = String(MAX_RUN_BUDGET_USDC);
  settingsTheme.value = settings.theme ?? "light";
  settingsNotifications.checked = Boolean(settings.notifications);

  if (didToken && settingsWalletPanel) {
    try {
      await ensureFreshDidToken();
      const balances = await fetchBalance(didToken);
      lastBalances = balances;
      settingsWalletPanel.innerHTML = renderDepositPanelHtml(balances);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === "SESSION_EXPIRED" || isSessionExpiredError(message)) {
        settingsWalletPanel.innerHTML = renderSessionExpiredHtml();
      } else {
        settingsWalletPanel.innerHTML = `<p class="empty-hint">${escapeHtml(message)}</p>`;
      }
    }
  }

  if (settingsAccountEmail) {
    settingsAccountEmail.textContent = userEmail ?? "—";
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
      try {
        const run = await fetchRun(didToken, btn.dataset.runId);
        openRunInResult(run, {
          renderResult: (result) => renderResult(result, { runId: run.id }),
        });
      } catch (err) {
        showToast(err?.message ?? "Could not open output", { type: "error" });
      }
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

function renderResult(result, { runId = null, updateUrl = true } = {}) {
  lastResult = result;
  lastResultRunId = runId;
  if (result.uaTopUpTxId) renderUaProof(result.uaTopUpTxId);
  else uaProofBlock?.setAttribute("hidden", "");

  const paidLines = result.spend.filter((l) => !l.included && l.usdc > 0);
  const totalStr = `$${result.totalUsdc.toFixed(4)}`;
  if (resultSummary) {
    resultSummary.textContent = `${paidLines.length} paid step${paidLines.length === 1 ? "" : "s"} · ${totalStr} x402`;
  }
  if (receiptTotalInline) receiptTotalInline.textContent = totalStr;

  const structured = renderDeliverable(result);
  deliverableEl.innerHTML = structured ?? renderMarkdown(result.deliverable);
  spendBody.innerHTML = "";
  for (const line of result.spend) {
    const tr = document.createElement("tr");
    if (line.included || (!line.txHash && line.usdc === 0)) {
      tr.innerHTML = `<td>${escapeHtml(line.service)}</td><td class="spend-amount">Included · $0</td><td>—</td>`;
    } else {
      const url = explorerUrlForPayment(line);
      const txCell = url
        ? `<a class="spend-tx-link" href="${url}" target="_blank" rel="noopener">Receipt ↗</a>`
        : "—";
      tr.innerHTML = `<td>${escapeHtml(line.service)}</td><td class="spend-amount">${formatUsdc(line.usdc)}</td><td>${txCell}</td>`;
    }
    spendBody.appendChild(tr);
  }
  totalSpent.innerHTML = `<strong class="total-spent-amount">${totalStr}</strong> <span class="muted">paid x402</span>`;
  if (followUpAnswer) {
    followUpAnswer.hidden = true;
    followUpAnswer.innerHTML = "";
  }
  if (followUpInput) followUpInput.value = "";
  showView("result", { runId: lastResultRunId, updateUrl });
}

async function sendFollowUp() {
  if (!lastResult?.deliverable) return;
  const question = followUpInput?.value?.trim();
  if (!question) {
    showToast("Enter a follow-up question.", { type: "warning" });
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
    showToast(`Follow-up failed: ${err.message}`, { type: "error" });
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
    // Magic eth_signTypedData_v4 requires the typed-data OBJECT, not JSON.stringify.
    // Stringifying produces invalid EIP-3009 signatures (facilitator: invalid_exact_evm_payload_signature).
    // @see https://magic.link docs — personal signatures / eth_signTypedData_v4
    // @see https://github.com/magiclabs/magic-js/issues/547
    const types = { ...(td.types || {}) };
    if (!types.EIP712Domain) {
      types.EIP712Domain = [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ];
    }
    const typedData = {
      domain: td.domain,
      types,
      primaryType: td.primaryType,
      message: td.message,
    };
    return magic.rpcProvider.request({
      method: "eth_signTypedData_v4",
      params: [walletAddress, typedData],
    });
  }
  throw new Error(`Unknown sign request kind: ${request.kind}`);
}

function hideEstimate() {
  if (estimateCard) estimateCard.hidden = true;
  if (budgetControl) budgetControl.hidden = true;
  if (runBtn) {
    runBtn.hidden = true;
    runBtn.disabled = false;
    runBtn.textContent = "Start run →";
  }
  if (estimateBudgetWarn) {
    estimateBudgetWarn.hidden = true;
    estimateBudgetWarn.textContent = "";
  }
  lastEstimate = null;
  lastEstimateGoal = "";
  activeBudgetPreset = "recommended";
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
  renderBudgetControl(estimate);
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
        const cost =
          step.kind === "compose" || step.estCostUsdc === 0
            ? `<span class="plan-step-included">Included · $0</span>`
            : `<span>$${Number(step.estCostUsdc).toFixed(4)}</span>`;
        return `<div class="plan-step-row"><span>${escapeHtml(label)}</span>${cost}</div>${why}`;
      })
      .join("") +
    `<div class="plan-step-row plan-step-row--total"><span>Paid x402 total</span><span>$${estimate.totalEstUsdc.toFixed(4)}</span></div>`;

  renderCatalogPicker(estimate.catalog);

  estimateTotal.innerHTML =
    `Paid tools: <strong>${formatUsdc(estimate.totalEstUsdc)}</strong> · ` +
    `compose included free`;
  estimateCard.hidden = false;
  runBtn.hidden = false;
}

async function fetchEstimate() {
  if (!(await requireAuth())) return;
  const goal = goalInput.value.trim();
  if (!goal) {
    showToast("Please enter a goal or pick a template.", { type: "warning" });
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
    showToast(`Estimate failed: ${err.message}`, { type: "error" });
  } finally {
    estimateBtn.disabled = false;
    estimateBtn.textContent = "Check price & plan →";
  }
}

async function startRun() {
  if (!(await requireAuth())) return;

  const goal = goalInput.value.trim();
  if (!goal) {
    showToast("Please enter a goal or pick a template.", { type: "warning" });
    return;
  }
  if (!lastEstimate?.plan) {
    showToast("Check the price and plan before starting a run.", { type: "warning" });
    return;
  }

  const budget = getSelectedRunBudget();
  if (budget < lastEstimate.plan.totalEstUsdc) {
    showToast(
      `Run limit ${formatBudget(budget)} is below the estimated ${formatUsdc(lastEstimate.plan.totalEstUsdc)}. Raise the limit to continue.`,
      { type: "warning" },
    );
    refreshBudgetControlStatus();
    runBudgetInput?.focus();
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
          if (!event.line.included) spent += event.line.usdc;
          updateBudgetBar(spent, runBudget, event.remaining);
          setStepState(event.line.service, event.line.included ? "settled" : "paid", event.line);
          activeStep = null;
          if (event.line.included) {
            appendLog(`  included $0 · ${event.line.service}`);
          } else {
            appendLog(`  paid $${event.line.usdc.toFixed(6)} tx=${event.line.txHash} · $${event.remaining.toFixed(4)} left`);
          }
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

  const launchSearch = window.location.search;
  const returnSearch = consumeReturnPath();
  const pendingRoute = resolveEntryRoute(
    returnSearch ? parseRoute(returnSearch) : parseRoute(launchSearch),
  );

  if (launchSearch && pendingRoute.view && isProtectedView(pendingRoute.view)) {
    sessionStorage.setItem(RETURN_PATH_KEY, launchSearch);
  }

  if (!magic) await initMagic();

  const loggedIn = await magic.user.isLoggedIn();
  if (!loggedIn) {
    redirectUnauthorized();
    return;
  }

  await loadUserSession();
  applyBudgetFromSearch(launchSearch);
  await loadAgents();
  wireFundModal(copyFundAddress, depositAddressNow);
  await applyRoute(pendingRoute);
  sessionStorage.removeItem(RETURN_PATH_KEY);
}

async function logout() {
  if (magic) await magic.user.logout();
  didToken = null;
  walletAddress = null;
  userEmail = null;
  lastBalances = null;
  lastResult = null;
  lastResultRunId = null;
  updateAuthUi();
  window.location.href = "/";
}

function openLogoutModal() {
  if (!logoutModal) {
    logout();
    return;
  }
  if (logoutModal.open) return;
  logoutModal.showModal();
}

settingsLogoutBtn?.addEventListener("click", () => openLogoutModal());
logoutConfirmBtn?.addEventListener("click", () => {
  logoutModal?.close();
  logout();
});
logoutModal?.addEventListener("cancel", (ev) => {
  ev.preventDefault();
  logoutModal.close();
});

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
  btn.addEventListener("click", () => {
    if (!isAuthed()) {
      redirectUnauthorized();
      return;
    }
    showView(btn.dataset.view);
  });
});

document.querySelectorAll("[data-goto]").forEach((el) => {
  el.addEventListener("click", () => {
    if (!isAuthed()) {
      redirectUnauthorized();
      return;
    }
    showView(el.dataset.goto);
  });
});

refreshBalanceBtn?.addEventListener("click", () => refreshBalances(balanceDetails));
fundWalletBtn?.addEventListener("click", () => openFundFlow());

document.querySelector(".app-brand")?.addEventListener("click", (ev) => {
  ev.preventDefault();
  if (!isAuthed()) {
    redirectUnauthorized();
    return;
  }
  showView("home");
});

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
  if (action === "open-login" || action === "relogin") {
    ev.preventDefault();
    redirectToLogin();
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
      showToast(addr, { type: "info", duration: 8000 });
    }
  }
});

document.getElementById("magic-wallet-ui-btn")?.addEventListener("click", async () => {
  // Kept only if a future screen re-adds #magic-wallet-ui-btn.
  closeDialogsBeforeMagicUi();
  try {
    if (!magic) await initMagic();
    await magic.wallet.showUI();
  } catch (err) {
    showToast(err?.message ?? "Magic wallet UI unavailable", { type: "error" });
  }
});

saveAgentBtn?.addEventListener("click", async () => {
  if (!(await requireAuth())) return;
  const goal = goalInput.value.trim();
  if (!goal) {
    showToast("Enter a goal first.", { type: "warning" });
    return;
  }
  const name = prompt("Agent name:");
  if (!name) return;
  try {
    await saveCustomAgent(didToken, {
      name,
      description: "Custom saved agent",
      goal,
      suggestedBudget: getSelectedRunBudget(),
    });
    await loadCustomAgents();
  } catch (err) {
    showToast(err.message, { type: "error" });
  }
});

settingsDefaultBudget?.addEventListener("change", () => {
  const parsed = parseRunBudgetInput(settingsDefaultBudget.value);
  if (parsed == null) {
    showToast("Default limit must be between $0.01 and $5.00 USDC.", { type: "warning" });
    settingsDefaultBudget.value = DEFAULT_RUN_BUDGET_USDC.toFixed(2);
    return;
  }
  saveSettings({ defaultBudget: parsed });
  settingsDefaultBudget.value = parsed.toFixed(2);
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
      showToast("Notification permission denied.", { type: "warning" });
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
    showToast("PDF export unavailable offline.", { type: "info" });
  }
});

shareSummaryBtn?.addEventListener("click", async () => {
  if (!lastResult) return;
  const summary = `${APP_BRAND}\nTotal: ${formatUsdc(lastResult.totalUsdc)}\n\n${lastResult.deliverable.slice(0, 500)}…`;
  if (navigator.share) {
    await navigator.share({ title: "Agent output", text: summary });
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

applyBudgetFromSearch(window.location.search);
wireBudgetControl();

initRouter((route, meta) => applyRoute(route, { fromPopstate: meta.fromPopstate }));

restoreSession();
