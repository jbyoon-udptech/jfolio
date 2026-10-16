/**
 * Minimal JSON HTTP client with timeout + exponential backoff retry.
 * NFR-002: transient provider failures must not take the system down.
 */
export interface FetchJsonOptions {
  timeoutMs?: number;
  retries?: number;
  headers?: Record<string, string>;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
}

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly url: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isRetryable(error: unknown): boolean {
  if (error instanceof HttpError) return error.status === 429 || error.status >= 500;
  // Network / timeout / abort errors are retryable.
  return true;
}

export async function fetchJson<T>(url: string, options: FetchJsonOptions = {}): Promise<T> {
  const { timeoutMs = 8000, retries = 2, headers = {}, fetchImpl = fetch } = options;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        headers: { accept: "application/json", ...headers },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new HttpError(`HTTP ${response.status} for ${url}`, response.status, url);
      }
      return (await response.json()) as T;
    } catch (error) {
      lastError = error;
      if (attempt === retries || !isRetryable(error)) break;
      await sleep(Math.min(200 * 2 ** attempt, 2000));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
