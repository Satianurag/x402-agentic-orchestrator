import { escapeHtml, formatUsdc, shortAddr } from "./utils.js";

export async function fetchBalance(didToken) {
  const res = await fetch("/api/balance", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ didToken }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error ?? `Balance failed (${res.status})`);
  }
  return res.json();
}

/** Single consumer-facing balance — prefers unified account credit. */
export function pickAvailableCredit(balances) {
  if (balances.uaUnifiedUsdc != null && balances.uaUnifiedUsdc > 0) {
    return balances.uaUnifiedUsdc;
  }
  return balances.baseUsdc ?? 0;
}

export function renderBalanceHtml(balances) {
  const available = pickAvailableCredit(balances);
  const low = available < 0.05;
  return `
    <p class="balance-primary ${low ? "balance-primary--low" : ""}">${formatUsdc(available)}</p>
    <p class="balance-hint">${low ? "Add funds before your next run" : "Available for new runs"}</p>
    <details class="balance-advanced">
      <summary>Account details</summary>
      <ul class="balance-list">
        <li><span>Spend wallet</span><strong>${formatUsdc(balances.baseUsdc)}</strong></li>
        <li><span>Report wallet</span><strong>${formatUsdc(balances.arbitrumUsdc)}</strong></li>
        ${
          balances.uaUnifiedUsdc != null
            ? `<li><span>Unified credit</span><strong>${formatUsdc(balances.uaUnifiedUsdc)}</strong></li>`
            : `<li><span>Unified credit</span><strong class="empty-hint">${escapeHtml(balances.uaError ?? "Unavailable")}</strong></li>`
        }
      </ul>
      <p class="balance-addr">${shortAddr(balances.eoaAddress)}</p>
    </details>
  `;
}

export async function showFundModal(walletAddress) {
  const modal = document.getElementById("fund-modal");
  const addrEl = document.getElementById("fund-address");
  const qrEl = document.getElementById("fund-qr");
  if (!modal || !addrEl) return;

  addrEl.textContent = walletAddress;
  qrEl.innerHTML = "";

  try {
    const QRCode = (await import("https://cdn.jsdelivr.net/npm/qrcode@1.5.4/+esm")).default;
    const canvas = document.createElement("canvas");
    await QRCode.toCanvas(canvas, walletAddress, { width: 180, margin: 2 });
    qrEl.appendChild(canvas);
  } catch {
    qrEl.innerHTML = "<p class='empty-hint'>QR unavailable offline</p>";
  }

  modal.showModal();
}

export function wireFundModal(copyBtn, walletAddress) {
  copyBtn?.addEventListener("click", async () => {
    if (!walletAddress) return;
    await navigator.clipboard.writeText(walletAddress);
    copyBtn.textContent = "Copied!";
    setTimeout(() => { copyBtn.textContent = "Copy"; }, 2000);
  });
}
