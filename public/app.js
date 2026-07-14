import { Magic } from "https://cdn.jsdelivr.net/npm/magic-sdk@33.9.0/+esm";

const views = {
  login: document.getElementById("view-login"),
  home: document.getElementById("view-home"),
  running: document.getElementById("view-running"),
  result: document.getElementById("view-result"),
};

const emailInput = document.getElementById("email");
const loginBtn = document.getElementById("login-btn");
const loginStatus = document.getElementById("login-status");
const logoutBtn = document.getElementById("logout-btn");
const walletLabel = document.getElementById("wallet-label");
const agentList = document.getElementById("agent-list");
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

let magic = null;
let didToken = null;
let walletAddress = null;

function showView(name) {
  for (const [key, el] of Object.entries(views)) {
    el.classList.toggle("active", key === name);
    el.hidden = key !== name;
  }
}

function appendLog(line) {
  runLog.textContent += line + "\n";
  runLog.scrollTop = runLog.scrollHeight;
}

function updateBudgetBar(spent, cap) {
  const pct = cap > 0 ? Math.min(100, (spent / cap) * 100) : 0;
  budgetFill.style.width = pct + "%";
  budgetLabel.textContent = `$${spent.toFixed(4)} / $${cap.toFixed(4)} USDC`;
}

async function initMagic() {
  const res = await fetch("/api/config");
  const cfg = await res.json();
  magic = new Magic(cfg.magicPublishableKey);
}

async function restoreSession() {
  if (!magic) await initMagic();
  const loggedIn = await magic.user.isLoggedIn();
  if (!loggedIn) {
    showView("login");
    return;
  }
  didToken = await magic.user.getIdToken();
  const meta = await magic.user.getMetadata();
  walletAddress = meta.publicAddress;
  walletLabel.textContent = `Wallet: ${walletAddress?.slice(0, 6)}…${walletAddress?.slice(-4)}`;
  showView("home");
  await loadAgents();
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
    await magic.auth.loginWithEmailOTP({ email });
    didToken = await magic.user.getIdToken();
    const meta = await magic.user.getMetadata();
    walletAddress = meta.publicAddress;
    walletLabel.textContent = `Wallet: ${walletAddress?.slice(0, 6)}…${walletAddress?.slice(-4)}`;
    loginStatus.textContent = "";
    showView("home");
    await loadAgents();
  } catch (err) {
    loginStatus.textContent = `Login failed: ${err.message}`;
  } finally {
    loginBtn.disabled = false;
  }
});

logoutBtn.addEventListener("click", async () => {
  if (magic) await magic.user.logout();
  didToken = null;
  walletAddress = null;
  showView("login");
});

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
    btn.addEventListener("click", () => {
      document.querySelectorAll(".agent-card").forEach((c) => c.classList.remove("selected"));
      btn.classList.add("selected");
      goalInput.value = agent.goal;
      budgetInput.value = agent.suggestedBudget;
    });
    agentList.appendChild(btn);
  }
}

function renderResult(result) {
  deliverableEl.textContent = result.deliverable;
  spendBody.innerHTML = "";
  for (const line of result.spend) {
    const tr = document.createElement("tr");
    const txCell = line.explorerUrl
      ? `<a href="${line.explorerUrl}" target="_blank" rel="noopener">${line.txHash.slice(0, 10)}…</a>`
      : line.txHash || "—";
    tr.innerHTML = `<td>${line.service}</td><td>$${line.usdc.toFixed(6)}</td><td>${txCell}</td>`;
    spendBody.appendChild(tr);
  }
  totalSpent.textContent = `$${result.totalUsdc.toFixed(6)} USDC`;
  showView("result");
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
  runLog.textContent = "";
  updateBudgetBar(0, budget);

  let spent = 0;

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
          appendLog("--- PLAN ---");
          for (const step of event.plan.steps) {
            appendLog(`  ${step.service}: ~$${step.estCostUsdc.toFixed(4)}`);
          }
          appendLog(`  Total est: $${event.plan.totalEstUsdc.toFixed(4)}\n`);
        } else if (event.type === "ua_topup") {
          appendLog(`[ua] cross-chain top-up $${event.amountUsdc} tx=${event.transactionId}`);
        } else if (event.type === "step_start") {
          appendLog(`> ${event.step.service}…`);
        } else if (event.type === "payment") {
          spent += event.line.usdc;
          updateBudgetBar(spent, budget);
          appendLog(`  paid $${event.line.usdc.toFixed(6)} tx=${event.line.txHash}`);
        } else if (event.type === "error") {
          appendLog(`ERROR: ${event.message}`);
        } else if (event.type === "done") {
          renderResult(event.result);
        }
      }
    }
  } catch (err) {
    appendLog(`FAILED: ${err.message}`);
  }
}

runBtn.addEventListener("click", startRun);

stopBtn.addEventListener("click", async () => {
  await fetch("/run/stop", { method: "POST" });
  appendLog("Stop requested.");
});

againBtn.addEventListener("click", () => showView("home"));

restoreSession();
