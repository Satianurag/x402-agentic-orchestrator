const MAX_VISIBLE = 3;
const DEFAULT_DURATION = 4500;

let stackEl = null;

function ensureStack() {
  if (!stackEl) {
    stackEl = document.getElementById("toast-stack");
  }
  if (!stackEl) {
    stackEl = document.createElement("div");
    stackEl.id = "toast-stack";
    stackEl.className = "toast-stack";
    stackEl.setAttribute("aria-live", "polite");
    stackEl.setAttribute("aria-relevant", "additions");
    document.body.appendChild(stackEl);
  }
  return stackEl;
}

function dismissToast(toast) {
  if (!toast.isConnected) return;
  toast.classList.remove("toast--in");
  toast.classList.add("toast--out");
  const remove = () => toast.remove();
  toast.addEventListener("transitionend", remove, { once: true });
  setTimeout(remove, 320);
}

/**
 * @param {string} message
 * @param {{ type?: 'info'|'success'|'warning'|'error', duration?: number }} [opts]
 */
export function showToast(message, { type = "info", duration = DEFAULT_DURATION } = {}) {
  const stack = ensureStack();

  while (stack.children.length >= MAX_VISIBLE) {
    dismissToast(stack.firstElementChild);
  }

  const toast = document.createElement("div");
  toast.className = `toast toast--${type}`;
  toast.setAttribute("role", type === "error" ? "alert" : "status");

  const text = document.createElement("p");
  text.className = "toast-message";
  text.textContent = message;

  const close = document.createElement("button");
  close.type = "button";
  close.className = "toast-close";
  close.setAttribute("aria-label", "Dismiss notification");
  close.textContent = "×";

  close.addEventListener("click", () => dismissToast(toast));
  toast.append(text, close);
  stack.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add("toast--in"));

  if (duration > 0) {
    setTimeout(() => dismissToast(toast), duration);
  }
}
