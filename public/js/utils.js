export function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function inlineMarkdown(text) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}

export function renderMarkdown(text) {
  const lines = text.split("\n");
  const out = [];
  let inList = false;
  let inCode = false;

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      if (!inCode) {
        if (inList) { out.push("</ul>"); inList = false; }
        out.push("<pre><code>");
        inCode = true;
      } else {
        out.push("</code></pre>");
        inCode = false;
      }
      continue;
    }
    if (inCode) {
      out.push(escapeHtml(line));
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      if (inList) { out.push("</ul>"); inList = false; }
      const level = heading[1].length;
      out.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      if (!inList) { out.push("<ul>"); inList = true; }
      out.push(`<li>${inlineMarkdown(line.replace(/^[-*]\s+/, ""))}</li>`);
      continue;
    }
    if (inList) { out.push("</ul>"); inList = false; }
    if (line.trim()) out.push(`<p>${inlineMarkdown(line)}</p>`);
  }
  if (inList) out.push("</ul>");
  if (inCode) out.push("</code></pre>");
  return out.join("\n");
}

export function networkIsArbitrum(network) {
  const n = (network || "").toLowerCase();
  return n.includes("42161") || n.includes("arbitrum");
}

export function explorerUrlForPayment(line) {
  if (line.explorerUrl) return line.explorerUrl;
  if (!line.txHash) return null;
  if (networkIsArbitrum(line.network)) return `https://arbiscan.io/tx/${line.txHash}`;
  return `https://basescan.org/tx/${line.txHash}`;
}

export function formatUsdc(n) {
  return `$${Number(n).toFixed(4)}`;
}

export function shortAddr(addr) {
  if (!addr) return "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function isInsufficientFunds(msg) {
  const m = (msg || "").toLowerCase();
  return m.includes("insufficient") || m.includes("universal account unified usdc") || m.includes("on-chain insufficient");
}

export const SERVICE_META = {
  tavily: { label: "Web search", icon: "🔍", chain: "base", blurb: "Searching the web for sources" },
  coingecko: { label: "Market data", icon: "📈", chain: "base", blurb: "Fetching live market prices" },
  firecrawl: { label: "Web crawl", icon: "🌐", chain: "base", blurb: "Reading pages for details" },
  browserbase: { label: "Browser session", icon: "🖥", chain: "base", blurb: "Running a live browser session" },
  exa: { label: "Semantic search", icon: "✦", chain: "base", blurb: "Finding relevant documents" },
  synthesize: { label: "Write report", icon: "📝", chain: "arbitrum", blurb: "Composing your final deliverable" },
};

export const SETTINGS_KEY = "x402-app-settings";

export function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
  } catch {
    return {};
  }
}

export function saveSettings(patch) {
  const current = loadSettings();
  const next = { ...current, ...patch };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  return next;
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme === "dark" ? "dark" : "light";
}

export async function requestNotificationPermission() {
  if (!("Notification" in window)) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  return Notification.requestPermission();
}

export function notifyRunComplete(goal, totalUsdc) {
  const settings = loadSettings();
  if (!settings.notifications) return;
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  new Notification("Run complete", {
    body: `${goal.slice(0, 80)} — $${totalUsdc.toFixed(2)} total`,
    icon: "/favicon.ico",
  });
}
