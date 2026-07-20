import { Magic } from "https://cdn.jsdelivr.net/npm/magic-sdk@33.9.0/+esm";
import { OAuthExtension } from "https://cdn.jsdelivr.net/npm/@magic-ext/oauth2@9.21.0/+esm";

export const LAUNCH_BUDGET_KEY = "x402-launch-budget";

let magic = null;
let loginResolve = null;

const loginModal = () => document.getElementById("login-modal");
const loginStatus = () => document.getElementById("login-status");

export function pickLaunchBudget() {
  const slider = document.getElementById("capSlider");
  const cap = slider ? parseInt(slider.value, 10) / 100 : 0.15;
  return Number.isFinite(cap) && cap > 0 ? cap.toFixed(2) : "0.15";
}

export function appEntryUrl(budget = pickLaunchBudget()) {
  return `/app?view=home&budget=${encodeURIComponent(budget)}`;
}

async function initMagic() {
  if (magic) return magic;
  const res = await fetch("/api/config");
  if (!res.ok) throw new Error(`Config failed (${res.status})`);
  const cfg = await res.json();
  if (!cfg.magicPublishableKey) throw new Error("Missing Magic publishable key");
  magic = new Magic(cfg.magicPublishableKey, {
    network: cfg.magicNetwork ?? "ethereum",
    extensions: [new OAuthExtension()],
  });
  return magic;
}

function oauthRedirectUri() {
  return `${window.location.origin}/`;
}

export async function isLoggedIn() {
  try {
    await initMagic();
    return magic.user.isLoggedIn();
  } catch {
    return false;
  }
}

export function openLoginModal() {
  const modal = loginModal();
  if (!modal) return Promise.resolve(false);
  if (modal.open) return Promise.resolve(true);
  const status = loginStatus();
  if (status) status.textContent = "";
  return new Promise((resolve) => {
    loginResolve = resolve;
    modal.showModal();
  });
}

export function closeLoginModal(success = false) {
  if (loginResolve) {
    const resolve = loginResolve;
    loginResolve = null;
    resolve(success);
  }
  const modal = loginModal();
  if (modal?.open) modal.close();
}

function enterApp() {
  const budget = sessionStorage.getItem(LAUNCH_BUDGET_KEY) || pickLaunchBudget();
  sessionStorage.removeItem(LAUNCH_BUDGET_KEY);
  window.location.href = appEntryUrl(budget);
}

async function handleOAuthRedirect() {
  if (!magic?.oauth2) return false;
  try {
    const result = await magic.oauth2.getRedirectResult();
    if (result?.magic?.idToken) return true;
  } catch {
    // No pending OAuth redirect.
  }
  return false;
}

export async function launchApp() {
  const budget = pickLaunchBudget();
  sessionStorage.setItem(LAUNCH_BUDGET_KEY, budget);
  if (await isLoggedIn()) {
    enterApp();
    return;
  }
  await openLoginModal();
}

async function loginWithEmail() {
  const emailInput = document.getElementById("email");
  const loginBtn = document.getElementById("login-btn");
  const email = emailInput?.value?.trim();
  if (!email) {
    if (loginStatus()) loginStatus().textContent = "Enter your email.";
    return;
  }
  if (loginBtn) loginBtn.disabled = true;
  if (loginStatus()) loginStatus().textContent = "Check your email for the code…";
  try {
    await initMagic();
    await magic.auth.loginWithEmailOTP({ email, showUI: true });
    closeLoginModal(true);
    enterApp();
  } catch (err) {
    if (loginStatus()) loginStatus().textContent = `Sign in failed: ${err.message}`;
  } finally {
    if (loginBtn) loginBtn.disabled = false;
  }
}

async function loginWithGoogle() {
  const googleBtn = document.getElementById("google-login-btn");
  if (googleBtn) googleBtn.disabled = true;
  try {
    await initMagic();
    const budget = sessionStorage.getItem(LAUNCH_BUDGET_KEY) || pickLaunchBudget();
    sessionStorage.setItem(LAUNCH_BUDGET_KEY, budget);
    if (loginStatus()) loginStatus().textContent = "Redirecting to Google…";
    await magic.oauth2.loginWithRedirect({
      provider: "google",
      redirectURI: oauthRedirectUri(),
    });
  } catch (err) {
    if (loginStatus()) loginStatus().textContent = `Google sign in failed: ${err.message}`;
    if (googleBtn) googleBtn.disabled = false;
  }
}

export async function initLandingAuth() {
  try {
    await initMagic();
    if (await handleOAuthRedirect()) {
      enterApp();
      return;
    }
    if (new URLSearchParams(window.location.search).get("open") === "login") {
      sessionStorage.setItem(LAUNCH_BUDGET_KEY, pickLaunchBudget());
      history.replaceState(null, "", "/");
      await openLoginModal();
    }
  } catch {
    // Landing still works without auth (budget demo, etc.).
  }

  document.getElementById("login-btn")?.addEventListener("click", loginWithEmail);
  document.getElementById("google-login-btn")?.addEventListener("click", loginWithGoogle);
  document.getElementById("login-modal-close")?.addEventListener("click", () => closeLoginModal(false));
  loginModal()?.addEventListener("cancel", (ev) => {
    ev.preventDefault();
    closeLoginModal(false);
  });

  document.querySelectorAll("[data-launch]").forEach((el) => {
    el.addEventListener("click", (ev) => {
      ev.preventDefault();
      launchApp();
    });
  });
}
