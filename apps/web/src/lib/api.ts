import type {
  Dashboard,
  HistoryPoint,
  Instrument,
  ListResponse,
  MarketQuote,
  Portfolio,
  PortfolioSnapshot,
  ProviderStatusView,
  SignalEvent,
  SignalRule,
  SystemDataStatus,
  Transaction,
  Valuation,
} from "./types";

/**
 * Server-side data access for the dashboard. All calls happen on the Next.js
 * server (never in the browser) so the API token stays out of the client bundle
 * and there is no cross-origin configuration to maintain.
 */

const BASE_URL = process.env.API_BASE_URL ?? "http://127.0.0.1:3001/api/v1";
const TOKEN = process.env.API_AUTH_TOKEN ?? "";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function authHeaders(): Record<string, string> {
  return TOKEN ? { authorization: `Bearer ${TOKEN}` } : {};
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...authHeaders(),
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    let message = `API request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      if (body?.error?.message) message = body.error.message;
    } catch {
      /* ignore non-JSON error bodies */
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

export const api = {
  dashboard: (params: { portfolioId?: string; baseCurrency?: string } = {}) =>
    request<Dashboard>(`/dashboard${query(params)}`),

  portfolios: () => request<ListResponse<Portfolio>>("/portfolios"),
  portfolio: (id: string) => request<Portfolio>(`/portfolios/${id}`),
  holdings: (id: string) =>
    request<{
      portfolioId: string;
      baseCurrency: string;
      asOf: string;
      dataStatus: string;
      unavailableCount: number;
      items: Valuation["positions"];
      cashBalances: Valuation["cashBalances"];
    }>(`/portfolios/${id}/holdings`),
  valuation: (id: string, params: { asOf?: string; baseCurrency?: string } = {}) =>
    request<Valuation>(`/portfolios/${id}/valuation${query(params)}`),
  history: (id: string, params: { from?: string; to?: string; interval?: string } = {}) =>
    request<{
      portfolioId: string;
      interval: string;
      from: string;
      to: string;
      items: HistoryPoint[];
    }>(`/portfolios/${id}/history${query(params)}`),
  snapshots: (id: string) =>
    request<ListResponse<PortfolioSnapshot>>(`/portfolios/${id}/snapshots`),

  instruments: (params: { assetType?: string; search?: string } = {}) =>
    request<ListResponse<Instrument>>(`/assets${query(params)}`),
  instrument: (id: string) =>
    request<Instrument & { latestQuote: MarketQuote | null }>(`/assets/${id}`),
  quotes: (id: string, params: { interval?: string; limit?: number } = {}) =>
    request<{ instrumentId: string; items: MarketQuote[]; total: number }>(
      `/assets/${id}/quotes${query(params)}`,
    ),

  transactions: (params: { portfolioId?: string; instrumentId?: string; limit?: number } = {}) =>
    request<ListResponse<Transaction>>(`/transactions${query(params)}`),

  signalRules: () => request<ListResponse<SignalRule>>("/signals/rules"),
  signalEvents: (params: { ruleId?: string; instrumentId?: string } = {}) =>
    request<ListResponse<SignalEvent>>(`/signals/events${query(params)}`),

  dataStatus: () => request<SystemDataStatus>("/system/data-status"),
  providers: () => request<ListResponse<ProviderStatusView>>("/system/providers"),
};

/** Server-only write operations, used by the Next.js route handlers. */
export const mutate = {
  createSignalRule: (body: unknown) =>
    request<SignalRule>("/signals/rules", { method: "POST", body: JSON.stringify(body) }),
  updateSignalRule: (id: string, body: unknown) =>
    request<SignalRule>(`/signals/rules/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteSignalRule: (id: string) =>
    request<{ deactivated: boolean; rule: SignalRule }>(`/signals/rules/${id}`, {
      method: "DELETE",
    }),
  createTransaction: (body: unknown) =>
    request<Transaction>("/transactions", { method: "POST", body: JSON.stringify(body) }),
  runCollection: (body: unknown) =>
    request<unknown>("/system/collection/run", { method: "POST", body: JSON.stringify(body) }),
};

/** Wrap a fetch so pages can render a friendly error state instead of crashing. */
export async function safe<T>(
  loader: () => Promise<T>,
): Promise<{ data: T; error: null } | { data: null; error: string }> {
  try {
    return { data: await loader(), error: null };
  } catch (error) {
    const message =
      error instanceof ApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : "알 수 없는 오류";
    return { data: null, error: message };
  }
}

export { BASE_URL };
