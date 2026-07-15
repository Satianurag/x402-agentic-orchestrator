const ham = document.getElementById("ham");
const navLinks = document.getElementById("navLinks");
ham?.addEventListener("click", () => navLinks.classList.toggle("open"));

// Reveal on scroll
const reveals = document.querySelectorAll(".reveal, .stagger");
const io = new IntersectionObserver(
  (entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add("in");
        io.unobserve(e.target);
      }
    });
  },
  { threshold: 0.12 },
);
reveals.forEach((el) => io.observe(el));

function copyText(txt, btn) {
  navigator.clipboard.writeText(txt).then(() => {
    const old = btn.textContent;
    btn.textContent = "COPIED ✓";
    setTimeout(() => {
      btn.textContent = old;
    }, 1400);
  });
}

document.getElementById("copyBtn")?.addEventListener("click", function () {
  copyText(document.getElementById("cliCode").textContent, this);
});
document.getElementById("copyFinal")?.addEventListener("click", function () {
  copyText("npm run test:e2e", this);
});

function launchApp() {
  const slider = document.getElementById("capSlider");
  const cap = slider ? (parseInt(slider.value, 10) / 100).toFixed(2) : "0.15";
  window.location.href = `/app?budget=${cap}`;
}

document.getElementById("runBtn")?.addEventListener("click", launchApp);

// Budget interactive (hero board demo — separate from /app run UI)
const slider = document.getElementById("capSlider");
const knob = document.getElementById("knob");
const knobVal = document.getElementById("knobVal");
const capVal = document.getElementById("capVal");
const budgetFill = document.getElementById("budgetFill");
const budgetLabel = document.getElementById("budgetLabel");
const pctLabel = document.getElementById("pctLabel");
const estTotEl = document.getElementById("estTot");
const estT = document.getElementById("estT");
const estC = document.getElementById("estC");
const estS = document.getElementById("estS");

const baseCosts = { t: 0.01, c: 0.01, s: 0.002 };

function updateBudget() {
  if (!slider) return;
  const v = parseInt(slider.value, 10);
  const cap = v / 100;
  const total = baseCosts.t + baseCosts.c + baseCosts.s;
  const pct = Math.min(98, Math.round((total / cap) * 100));
  const remaining = (cap - total).toFixed(3);

  knobVal.textContent = `$${cap.toFixed(2)}`;
  capVal.textContent = `${cap.toFixed(2)} USDC`;
  budgetFill.style.width = `${pct}%`;
  knob.style.setProperty("--pct", `${pct}%`);
  budgetLabel.textContent = `$${cap.toFixed(2)} → $${cap > total ? remaining : "0.00"}`;
  pctLabel.textContent = `${pct}% USED`;
  estTotEl.textContent = total.toFixed(3);
  if (estT) estT.textContent = baseCosts.t.toFixed(3);
  if (estC) estC.textContent = baseCosts.c.toFixed(3);
  if (estS) estS.textContent = baseCosts.s.toFixed(3);

  if (cap < total) {
    budgetMsg.textContent = "✕ BUDGET_EXCEEDED — CHAIN WOULD REJECT";
    budgetMsg.style.background = "var(--pink)";
    budgetMsg.style.color = "white";
    budgetFill.style.background =
      "repeating-linear-gradient(45deg, var(--pink) 0 12px, var(--ink) 12px 14px)";
  } else {
    budgetMsg.textContent = "✓ BUDGET OK — WILL SETTLE";
    budgetMsg.style.background = "var(--lime)";
    budgetMsg.style.color = "var(--ink)";
    budgetFill.style.background =
      "repeating-linear-gradient(45deg, var(--lime) 0 12px, var(--ink) 12px 14px)";
  }
}

slider?.addEventListener("input", updateBudget);
updateBudget();

// Subtle parallax for board
const board = document.getElementById("board");
if (board && !window.matchMedia("(prefers-reduced-motion: reduce)").matches && window.innerWidth > 1024) {
  document.addEventListener("mousemove", (e) => {
    const rect = board.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = (e.clientX - cx) / rect.width;
    const dy = (e.clientY - cy) / rect.height;
    board.style.transform = `rotateX(${-dy * 4}deg) rotateY(${dx * 6}deg) rotate(0.6deg)`;
  });
}

// Flow cards pulse pending step
setInterval(() => {
  const pending = document.querySelector(".flow-card .pending");
  if (!pending) return;
  pending.style.background = pending.style.background === "rgb(255, 214, 10)" ? "var(--lime)" : "var(--yellow)";
}, 900);

// Live network badge + CLI hint from server config
fetch("/api/config")
  .then((r) => {
    if (!r.ok) throw new Error(`config ${r.status}`);
    return r.json();
  })
  .then((cfg) => {
    const network = cfg.network ?? "mainnet";
    const badge = document.getElementById("networkBadge");
    if (badge) {
      badge.textContent =
        network === "mainnet"
          ? "⚡ LIVE ON MAINNET — BASE + ARBITRUM"
          : `⚡ LIVE ON TESTNET — NETWORK=${network.toUpperCase()}`;
    }
    const cli = document.getElementById("cliCode");
    if (cli) {
      cli.textContent = `npm run cli -- --goal "BTC price brief" --budget 0.15 --network ${network}`;
    }
  })
  .catch(() => {
    const badge = document.getElementById("networkBadge");
    if (badge) badge.textContent = "⚡ LIVE — X402 ORCHESTRATOR";
  });
