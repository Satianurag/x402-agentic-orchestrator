const DEFAULT_RETRY_STATUSES = new Set([408, 429, 502, 503, 504]);

export interface FetchWithRetryOptions {
  attempts?: number;
  retryOn?: number[];
  baseDelayMs?: number;
  timeoutMs?: number;
  label?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Pre-payment HTTP fetch with bounded retries (vendor 5xx / timeout). */
export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  options: FetchWithRetryOptions = {},
): Promise<Response> {
  const attempts = options.attempts ?? 3;
  const retryOn = new Set(options.retryOn ?? [...DEFAULT_RETRY_STATUSES]);
  const baseDelayMs = options.baseDelayMs ?? 800;
  const timeoutMs = options.timeoutMs ?? 20_000;
  const label = options.label ?? url;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(url, {
        ...init,
        signal: init.signal ?? AbortSignal.timeout(timeoutMs),
      });

      if (retryOn.has(res.status) && attempt < attempts) {
        const delay = baseDelayMs * attempt;
        console.warn(
          `[http-retry] ${label}: HTTP ${res.status} — retry ${attempt}/${attempts - 1} in ${delay}ms`,
        );
        await sleep(delay);
        continue;
      }

      return res;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const retryable =
        lastError.name === "TimeoutError" ||
        lastError.name === "AbortError" ||
        /fetch failed|network|ECONNRESET|ETIMEDOUT/i.test(lastError.message);

      if (!retryable || attempt >= attempts) throw lastError;

      const delay = baseDelayMs * attempt;
      console.warn(
        `[http-retry] ${label}: ${lastError.message.slice(0, 80)} — retry ${attempt}/${attempts - 1} in ${delay}ms`,
      );
      await sleep(delay);
    }
  }

  throw lastError ?? new Error(`${label}: request failed after ${attempts} attempts`);
}
