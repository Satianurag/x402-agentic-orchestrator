const ham = document.getElementById("ham");
const navLinks = document.getElementById("navLinks");
ham?.addEventListener("click", () => navLinks.classList.toggle("open"));

const reveals = document.querySelectorAll(".reveal, .stagger");
const io = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        e.target.classList.add("in");
        io.unobserve(e.target);
      }
    }
  },
  { threshold: 0.12 },
);
reveals.forEach((el) => io.observe(el));

function launchApp() {
  const slider = document.getElementById("capSlider");
  const cap = slider ? (parseInt(slider.value, 10) / 100).toFixed(2) : "0.15";
  window.location.href = `/app?budget=${cap}`;
}

document.getElementById("runBtn")?.addEventListener("click", launchApp);

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
const budgetMsg = document.getElementById("budgetMsg");

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
  pctLabel.textContent = `${pct}% OF CAP (EXAMPLE)`;
  estTotEl.textContent = total.toFixed(3);
  if (estT) estT.textContent = baseCosts.t.toFixed(3);
  if (estC) estC.textContent = baseCosts.c.toFixed(3);
  if (estS) estS.textContent = baseCosts.s.toFixed(3);

  if (cap < total) {
    budgetMsg.textContent = "✕ EXAMPLE EXCEEDS CAP";
    budgetMsg.style.background = "var(--pink)";
    budgetMsg.style.color = "white";
    budgetFill.style.background =
      "repeating-linear-gradient(45deg, var(--pink) 0 12px, var(--ink) 12px 14px)";
  } else {
    budgetMsg.textContent = "✓ EXAMPLE FITS CAP";
    budgetMsg.style.background = "var(--lime)";
    budgetMsg.style.color = "var(--ink)";
    budgetFill.style.background =
      "repeating-linear-gradient(45deg, var(--lime) 0 12px, var(--ink) 12px 14px)";
  }
}

slider?.addEventListener("input", updateBudget);
updateBudget();

const board = document.getElementById("board");
if (
  board &&
  !window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
  window.innerWidth > 1024
) {
  document.addEventListener("mousemove", (e) => {
    const rect = board.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = (e.clientX - cx) / rect.width;
    const dy = (e.clientY - cy) / rect.height;
    board.style.transform = `rotateX(${-dy * 3}deg) rotateY(${dx * 5}deg) rotate(0.6deg)`;
  });
}

fetch("/api/config")
  .then((r) => (r.ok ? r.json() : null))
  .then((cfg) => {
    const badge = document.getElementById("networkBadge");
    if (!badge) return;
    if (cfg?.network === "mainnet") {
      badge.textContent = "⚡ LIVE ON MAINNET — BASE + ARBITRUM ONE";
    } else if (cfg?.network) {
      badge.textContent = `⚡ NETWORK: ${String(cfg.network).toUpperCase()}`;
    }
  })
  .catch(() => {});
