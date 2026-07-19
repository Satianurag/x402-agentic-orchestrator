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

function bodyNeedsDuplex(body: RequestInit["body"]): boolean {
  if (body == null) return false;
  if (typeof body === "string") return false;
  if (body instanceof ArrayBuffer) return false;
  if (ArrayBuffer.isView(body)) return false;
  if (typeof Blob !== "undefined" && body instanceof Blob) return false;
  if (typeof FormData !== "undefined" && body instanceof FormData) return false;
  if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) return false;
  return true;
}

/** Node undici requires duplex when body is a ReadableStream. */
function withNodeFetchCompat(init: RequestInit): RequestInit {
  if (!bodyNeedsDuplex(init.body)) return init;
  return { ...init, duplex: "half" };
}

/**
 * Materialize a Request body so retries can replay it.
 * Node fetch rejects stream bodies without `duplex: 'half'` when passed via RequestInit.
 */
export async function snapshotRequestInit(req: Request): Promise<RequestInit> {
  if (!req.body) {
    return { method: req.method, headers: req.headers };
  }
  const body = await req.clone().arrayBuffer();
  return {
    method: req.method,
    headers: req.headers,
    body: body.byteLength > 0 ? Buffer.from(body) : undefined,
  };
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
  const normalizedInit = withNodeFetchCompat(init);

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(url, {
        ...normalizedInit,
        signal: normalizedInit.signal ?? AbortSignal.timeout(timeoutMs),
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
