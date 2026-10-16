import type { DataInterval } from "./asset";

/**
 * FR-020: Standard market quote shape every provider must normalise to.
 * `timestamp` is the "as-of" time of the price, `receivedAt` is when our
 * server stored it. These must not be conflated.
 */
export interface MarketQuote {
  instrumentId: string;
  providerId: string;
  interval: DataInterval;
  /** As-of time of the price (UTC). */
  timestamp: Date;
  /** Server receipt time (UTC). */
  receivedAt: Date;
  /** Representative price (last / close). */
  price: number;
  currency: string;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
  isFinal?: boolean;
}

export interface LatestQuote {
  instrumentId: string;
  providerId: string;
  interval: DataInterval;
  timestamp: Date;
  receivedAt: Date;
  price: number;
  currency: string;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
  isFinal?: boolean;
  /** Change ratio vs the previous close, when known (fraction, e.g. -0.05). */
  changeRate?: number | null;
}

/**
 * FR-042: An FX rate expressed as 1 unit of `base` == `rate` units of `quote`.
 * e.g. USD -> KRW stored as { base: "USD", quote: "KRW", rate: 1345.9 }.
 */
export interface FxRate {
  base: string;
  quote: string;
  rate: number;
  timestamp: Date;
  receivedAt: Date;
  providerId: string;
  isFinal?: boolean;
}
