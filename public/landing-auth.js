import { Magic } from "https://cdn.jsdelivr.net/npm/magic-sdk@33.9.0/+esm";
import { OAuthExtension } from "https://cdn.jsdelivr.net/npm/@magic-ext/oauth2@9.21.0/+esm";

import { RETURN_PATH_KEY } from "./js/router.js";

export const LAUNCH_BUDGET_KEY = "x402-launch-budget";

let magic = null;
let loginResolve = null;
let otpHandle = null;
let pendingEmail = "";
let otpCancelled = false;
let pendingOtpSentResolve = null;

const loginModal = () => document.getElementById("login-modal");
const loginStatus = () => document.getElementById("login-status");
const emailStep = () => document.getElementById("login-step-email");
const otpStep = () => document.getElementById("login-step-otp");

function setLoginStatus(message) {
  const status = loginStatus();
  if (status) status.textContent = message;
}

function setLoginStep(step) {
  const email = emailStep();
  const otp = otpStep();
  if (email) email.hidden = step !== "email";
  if (otp) otp.hidden = step !== "otp";
}

function setLoginControlsDisabled(disabled) {
  for (const id of ["login-btn", "google-login-btn", "otp-verify-btn", "otp-resend-btn", "otp-back-btn"]) {
    const el = document.getElementById(id);
    if (el) el.disabled = disabled;
  }
}

function resetLoginModalUi() {
  setLoginStep("email");
  setLoginStatus("");
  const otpInput = document.getElementById("otp");
  if (otpInput) otpInput.value = "";
}

function abortEmailOtpHandle() {
  if (!otpHandle) return;
  try {
    otpHandle.emit("cancel");
  } catch {
    // Flow may already be settled.
  }
  otpHandle = null;
}

function cancelEmailOtpFlow() {
  abortEmailOtpHandle();
  otpCancelled = true;
  pendingOtpSentResolve = null;
}

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
  resetLoginModalUi();
  return new Promise((resolve) => {
    loginResolve = resolve;
    modal.showModal();
  });
}

export function closeLoginModal(success = false) {
  cancelEmailOtpFlow();
  resetLoginModalUi();
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
  const saved = sessionStorage.getItem(RETURN_PATH_KEY);
  if (saved) {
    const params = new URLSearchParams(saved.replace(/^\?/, ""));
    if (!params.has("budget")) params.set("budget", budget);
    window.location.href = `/app?${params.toString()}`;
    return;
  }
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

function onOtpEmailSent({ resend = false } = {}) {
  setLoginStep("otp");
  const display = document.getElementById("otp-email-display");
  if (display) display.textContent = pendingEmail;
  const otpInput = document.getElementById("otp");
  if (otpInput) {
    otpInput.value = "";
    otpInput.focus();
  }
  setLoginStatus(resend ? "New code sent." : "");
  setLoginControlsDisabled(false);
  pendingOtpSentResolve?.();
  pendingOtpSentResolve = null;
}

function onOtpLoginFailed(message) {
  if (otpCancelled) return;
  setLoginStatus(message);
  setLoginStep("email");
  setLoginControlsDisabled(false);
  otpHandle = null;
  pendingOtpSentResolve = null;
}

function wireOtpHandle(handle, { resend = false } = {}) {
  handle.on("email-otp-sent", () => onOtpEmailSent({ resend }));

  handle.on("invalid-email-otp", () => {
    setLoginStatus("Invalid code. Try again.");
    document.getElementById("otp")?.select();
    setLoginControlsDisabled(false);
  });

  handle.on("error", (err) => {
    onOtpLoginFailed(`Sign in failed: ${err?.message ?? "Unknown error"}`);
  });

  handle
    .then(() => {
      if (otpCancelled) return;
      otpHandle = null;
      closeLoginModal(true);
      enterApp();
    })
    .catch((err) => {
      onOtpLoginFailed(`Sign in failed: ${err?.message ?? "Unknown error"}`);
    });
}

async function sendOtpToEmail(email, { resend = false } = {}) {
  pendingEmail = email;
  abortEmailOtpHandle();
  otpCancelled = false;
  setLoginControlsDisabled(true);
  setLoginStatus(resend ? "Sending a new code…" : "Sending code…");

  await initMagic();
  const handle = magic.auth.loginWithEmailOTP({
    email,
    showUI: false,
    deviceCheckUI: false,
  });
  otpHandle = handle;
  wireOtpHandle(handle, { resend });

  await new Promise((resolve, reject) => {
    pendingOtpSentResolve = resolve;
    const onSendError = (err) => {
      pendingOtpSentResolve = null;
      handle.off?.("error", onSendError);
      reject(err);
    };
    handle.on("error", onSendError);
  });
}

async function loginWithEmail() {
  const emailInput = document.getElementById("email");
  const email = emailInput?.value?.trim() ?? "";
  if (!email) {
    setLoginStatus("Enter your email.");
    return;
  }
  if (emailInput) emailInput.value = email;

  try {
    await sendOtpToEmail(email);
  } catch (err) {
    if (otpCancelled) return;
    setLoginStatus(`Sign in failed: ${err.message}`);
    setLoginControlsDisabled(false);
  }
}

function verifyOtp() {
  const otp = document.getElementById("otp")?.value?.trim();
  if (!otp) {
    setLoginStatus("Enter the code from your email.");
    return;
  }
  if (!otpHandle) {
    setLoginStatus("Session expired. Go back and try again.");
    return;
  }
  setLoginControlsDisabled(true);
  setLoginStatus("");
  otpHandle.emit("verify-email-otp", otp);
}

function backToEmailStep() {
  cancelEmailOtpFlow();
  otpCancelled = false;
  setLoginStep("email");
  setLoginStatus("");
  const emailInput = document.getElementById("email");
  if (emailInput && pendingEmail) emailInput.value = pendingEmail;
  setLoginControlsDisabled(false);
}

async function resendOtp() {
  if (!pendingEmail) {
    backToEmailStep();
    return;
  }
  try {
    await sendOtpToEmail(pendingEmail, { resend: true });
  } catch (err) {
    if (otpCancelled) return;
    setLoginStatus(`Could not resend code: ${err.message}`);
    setLoginControlsDisabled(false);
  }
}

async function loginWithGoogle() {
  const googleBtn = document.getElementById("google-login-btn");
  if (googleBtn) googleBtn.disabled = true;
  try {
    await initMagic();
    const budget = sessionStorage.getItem(LAUNCH_BUDGET_KEY) || pickLaunchBudget();
    sessionStorage.setItem(LAUNCH_BUDGET_KEY, budget);
    setLoginStatus("Redirecting to Google…");
    await magic.oauth2.loginWithRedirect({
      provider: "google",
      redirectURI: oauthRedirectUri(),
    });
  } catch (err) {
    setLoginStatus(`Google sign in failed: ${err.message}`);
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
      if (!sessionStorage.getItem(LAUNCH_BUDGET_KEY)) {
        sessionStorage.setItem(LAUNCH_BUDGET_KEY, pickLaunchBudget());
      }
      history.replaceState(null, "", "/");
      await openLoginModal();
    }
  } catch {
    // Landing still works without auth (budget demo, etc.).
  }

  document.getElementById("login-btn")?.addEventListener("click", loginWithEmail);
  document.getElementById("google-login-btn")?.addEventListener("click", loginWithGoogle);
  document.getElementById("otp-verify-btn")?.addEventListener("click", verifyOtp);
  document.getElementById("otp-resend-btn")?.addEventListener("click", resendOtp);
  document.getElementById("otp-back-btn")?.addEventListener("click", backToEmailStep);
  document.getElementById("otp")?.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      verifyOtp();
    }
  });
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
