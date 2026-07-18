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

export function renderBalanceHtml(balances) {
  const uaLine = balances.uaUnifiedUsdc != null
    ? `<li><span>Particle UA (unified)</span><strong>${formatUsdc(balances.uaUnifiedUsdc)}</strong></li>`
    : `<li><span>Particle UA</span><strong class="empty-hint">${escapeHtml(balances.uaError ?? "Unavailable")}</strong></li>`;

  return `
    <ul class="balance-list">
      <li><span>Base EOA</span><strong>${formatUsdc(balances.baseUsdc)}</strong></li>
      <li><span>Arbitrum EOA</span><strong>${formatUsdc(balances.arbitrumUsdc)}</strong></li>
      ${uaLine}
    </ul>
    <p class="balance-addr">${shortAddr(balances.eoaAddress)}</p>
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
    setTimeout(() => { copyBtn.textContent = "Copy address"; }, 2000);
  });
}
