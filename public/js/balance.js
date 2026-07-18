import { escapeHtml, formatUsdc, shortAddr } from "./utils.js";

export async function fetchBalance(didToken) {
  const res = await fetch("/api/balance", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ didToken }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Balance failed (${res.status})`);
  }
  return res.json();
}

/** Prefer unified UA credit (getPrimaryAssets); else Base spend wallet. */
export function pickAvailableCredit(balances) {
  if (balances.uaUnifiedUsdc != null && balances.uaUnifiedUsdc > 0) {
    return balances.uaUnifiedUsdc;
  }
  return balances.baseUsdc ?? 0;
}

/** Official deposit target: EVM UA address when UA works, else Magic EOA. */
export function pickDepositAddress(balances) {
  return balances.uaSmartAccountAddress || balances.eoaAddress;
}

export function isSessionExpiredError(message) {
  const m = String(message || "").toLowerCase();
  return (
    m.includes("didt_expired") ||
    m.includes("did token has expired") ||
    m.includes("token has expired") ||
    m.includes("request failed authentication")
  );
}

export function renderSessionExpiredHtml() {
  return `
    <p class="balance-primary balance-primary--low">Session expired</p>
    <p class="balance-hint">Continue to refresh your account.</p>
    <div class="balance-fund-row">
      <button type="button" class="btn btn-primary btn-sm" data-action="open-login">Continue</button>
    </div>
  `;
}

export function renderDepositPanelHtml(balances) {
  const deposit = pickDepositAddress(balances) || "";
  const depositLabel = balances.uaSmartAccountAddress
    ? "Your deposit address"
    : "Your deposit address (Base USDC)";
  return `
    <div class="balance-fund-row">
      <button type="button" class="btn btn-primary btn-sm" data-action="add-funds">Add funds</button>
      ${deposit ? `<button type="button" class="btn btn-secondary btn-sm" data-action="copy-deposit" data-address="${escapeHtml(deposit)}">Copy address</button>` : ""}
    </div>
    <div class="balance-deposit" ${deposit ? "" : "hidden"}>
      <p class="balance-deposit-label">${escapeHtml(depositLabel)}</p>
      <code class="balance-deposit-addr" title="${escapeHtml(deposit)}">${escapeHtml(deposit)}</code>
    </div>
  `;
}

export function renderBalanceHtml(balances) {
  const available = pickAvailableCredit(balances);
  const low = available < 0.05;
  const deposit = pickDepositAddress(balances) || "";
  const depositLabel = balances.uaSmartAccountAddress
    ? "Your deposit address"
    : "Your deposit address (Base USDC)";
  return `
    <p class="balance-primary ${low ? "balance-primary--low" : ""}">${formatUsdc(available)}</p>
    <p class="balance-hint">${low ? "Add funds before your next run" : "Available for new runs"}</p>
    <div class="balance-fund-row">
      <button type="button" class="btn btn-primary btn-sm" data-action="add-funds">Add funds</button>
      ${deposit ? `<button type="button" class="btn btn-secondary btn-sm" data-action="copy-deposit" data-address="${escapeHtml(deposit)}">Copy address</button>` : ""}
    </div>
    <div class="balance-deposit" ${deposit ? "" : "hidden"}>
      <p class="balance-deposit-label">${escapeHtml(depositLabel)}</p>
      <code class="balance-deposit-addr" title="${escapeHtml(deposit)}">${escapeHtml(deposit)}</code>
    </div>
    <details class="balance-advanced">
      <summary>Account details</summary>
      <ul class="balance-list">
        <li><span>Available credit</span><strong>${formatUsdc(available)}</strong></li>
        <li><span>Unified credit</span><strong>${
          balances.uaUnifiedUsdc != null
            ? formatUsdc(balances.uaUnifiedUsdc)
            : `<span class="empty-hint">${escapeHtml(balances.uaError ?? "Unavailable")}</span>`
        }</strong></li>
        <li><span>Spend wallet (Base)</span><strong>${formatUsdc(balances.baseUsdc)}</strong></li>
        <li><span>Settlement wallet (Arbitrum)</span><strong>${formatUsdc(balances.arbitrumUsdc)}</strong></li>
      </ul>
      <p class="balance-addr">${shortAddr(deposit)}</p>
    </details>
  `;
}

export async function showFundModal(balancesOrAddress) {
  const modal = document.getElementById("fund-modal");
  const addrEl = document.getElementById("fund-address");
  const qrEl = document.getElementById("fund-qr");
  const guidanceEl = document.getElementById("fund-guidance");
  const labelEl = document.getElementById("fund-address-label");
  if (!modal || !addrEl) return;

  const isObj = balancesOrAddress && typeof balancesOrAddress === "object";
  const deposit = isObj
    ? pickDepositAddress(balancesOrAddress)
    : balancesOrAddress;
  const uaAddr = isObj ? balancesOrAddress.uaSmartAccountAddress : null;
  const uaError = isObj ? balancesOrAddress.uaError : null;

  addrEl.textContent = deposit || "—";
  if (labelEl) {
    labelEl.textContent = uaAddr ? "Deposit address" : "Deposit address";
  }
  if (guidanceEl) {
    if (uaAddr || deposit) {
      guidanceEl.innerHTML = `
        <li>In your exchange or wallet, pick network <strong>Base</strong>.</li>
        <li>Send <strong>USDC</strong> (native Circle USDC) to the address above.</li>
        <li>Wait for confirmation, then tap <strong>Refresh</strong> in the app.</li>
        <li>Other supported stablecoins on Base / Arbitrum / Ethereum to this same address also work — USDC on Base is simplest.</li>
      `;
    } else {
      guidanceEl.innerHTML = `
        <li>Deposit address unavailable${uaError ? ` (${escapeHtml(uaError)})` : ""}.</li>
        <li>Open Add funds from the app menu after your session is active.</li>
      `;
    }
  }

  if (qrEl) {
    qrEl.innerHTML = "";
    if (deposit) {
      try {
        const QRCode = (await import("https://cdn.jsdelivr.net/npm/qrcode@1.5.4/+esm")).default;
        const canvas = document.createElement("canvas");
        await QRCode.toCanvas(canvas, deposit, { width: 180, margin: 2 });
        qrEl.appendChild(canvas);
      } catch {
        qrEl.innerHTML = "<p class='empty-hint'>QR unavailable offline</p>";
      }
    }
  }

  modal.showModal();
}

export function wireFundModal(copyBtn, getAddress) {
  copyBtn?.addEventListener("click", async () => {
    const walletAddress = typeof getAddress === "function" ? getAddress() : getAddress;
    if (!walletAddress) return;
    await navigator.clipboard.writeText(walletAddress);
    copyBtn.textContent = "Copied!";
    setTimeout(() => { copyBtn.textContent = "Copy address"; }, 2000);
  });
}
