export const RETURN_PATH_KEY = "x402-app-return-path";
/** Default screen after login — merged Home (overview + new task). */
export const DEFAULT_ENTRY_VIEW = "home";

const PROTECTED_VIEWS = new Set([
  "home", "running", "result", "history", "analytics", "settings",
]);

const ROUTABLE_VIEWS = new Set([...PROTECTED_VIEWS]);

let suppressHistorySync = false;

export function isProtectedView(view) {
  return PROTECTED_VIEWS.has(view);
}

export function isRoutableView(view) {
  return ROUTABLE_VIEWS.has(view);
}

/** @param {string} [search] */
export function parseRoute(search = window.location.search) {
  const params = new URLSearchParams(search);
  let view = params.get("view");
  if (view === "dashboard") view = "home";
  const runId = params.get("run");
  return {
    view: view && isRoutableView(view) ? view : null,
    runId: runId || null,
  };
}

/**
 * @param {string|null} view
 * @param {{ runId?: string|null }} [opts]
 */
export function buildAppUrl(view, { runId = null } = {}) {
  const url = new URL(window.location.href);
  if (!view) {
    url.searchParams.delete("view");
    url.searchParams.delete("run");
  } else {
    url.searchParams.set("view", view);
    if (view === "result" && runId) {
      url.searchParams.set("run", runId);
    } else {
      url.searchParams.delete("run");
    }
  }
  return url;
}

export function saveReturnPath(routeOrSearch) {
  if (typeof routeOrSearch === "string") {
    if (routeOrSearch) sessionStorage.setItem(RETURN_PATH_KEY, routeOrSearch);
    return;
  }
  const route = routeOrSearch;
  if (route?.view && isProtectedView(route.view)) {
    const params = new URLSearchParams();
    params.set("view", route.view);
    if (route.runId) params.set("run", route.runId);
    sessionStorage.setItem(RETURN_PATH_KEY, `?${params}`);
    return;
  }
  const { search } = window.location;
  if (search) sessionStorage.setItem(RETURN_PATH_KEY, search);
}

export function consumeReturnPath() {
  const saved = sessionStorage.getItem(RETURN_PATH_KEY);
  sessionStorage.removeItem(RETURN_PATH_KEY);
  return saved || null;
}

/** Fill missing view with the launch entry screen (New task). */
export function resolveEntryRoute(route) {
  if (route?.view) return route;
  return { view: DEFAULT_ENTRY_VIEW, runId: route?.runId ?? null };
}

/**
 * @param {string} view
 * @param {{ runId?: string|null, mode?: 'push'|'replace'|'none' }} [opts]
 */
export function syncHistory(view, { runId = null, mode = "push" } = {}) {
  if (suppressHistorySync || mode === "none") return;

  const url = buildAppUrl(view, { runId });
  const state = { view: view ?? null, runId: runId ?? null };

  if (mode === "replace") {
    history.replaceState(state, "", url);
  } else {
    history.pushState(state, "", url);
  }
}

/**
 * @param {(route: { view: string|null, runId: string|null }, meta: { fromPopstate: boolean }) => void | Promise<void>} onNavigate
 */
export function initRouter(onNavigate) {
  window.addEventListener("popstate", () => {
    suppressHistorySync = true;
    Promise.resolve(onNavigate(parseRoute(), { fromPopstate: true })).finally(() => {
      suppressHistorySync = false;
    });
  });
}

export function withHistorySyncPaused(fn) {
  suppressHistorySync = true;
  try {
    return fn();
  } finally {
    suppressHistorySync = false;
  }
}
