import type { SIGNAL_TYPES, REFERENCE_TYPES } from "../constants/domain";

export type SignalType = (typeof SIGNAL_TYPES)[number];
export type ReferenceType = (typeof REFERENCE_TYPES)[number];

export type SignalEventStatus = "OPEN" | "RESOLVED" | "IGNORED";
export type NotificationStatus = "PENDING" | "SENT" | "FAILED" | "SKIPPED";

/**
 * FR-062: User-defined signal rule.
 *
 * `threshold` semantics:
 *  - PRICE_DROP:      drop percentage, positive number (5 means "drop >= 5%")
 *  - PRICE_RISE:      rise percentage, positive number
 *  - PRICE_THRESHOLD: absolute target price
 *  - PORTFOLIO_THRESHOLD: portfolio value threshold in base currency
 *
 * `referenceType`:
 *  - FIXED_PRICE:     use `referenceValue`
 *  - PREVIOUS_CLOSE:  previous trading day close
 *  - ROLLING_HIGH:    highest price within `windowSeconds`
 *  - ROLLING_WINDOW:  price `windowSeconds` ago
 */
export interface SignalRule {
  ruleId: string;
  portfolioId?: string | null;
  instrumentId: string;
  signalType: SignalType;
  threshold: number;
  referenceType: ReferenceType;
  referenceValue?: number | null;
  /** Observation window for rolling reference types, in seconds. */
  windowSeconds?: number | null;
  isEnabled: boolean;
  cooldownSeconds?: number | null;
  /**
   * FR-063: runtime de-duplication state. `isTriggered` is true while the
   * condition is continuously satisfied, which suppresses repeat events.
   */
  isTriggered: boolean;
  episode: number;
  lastTriggeredAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * FR-064: A recorded signal occurrence. Distinct from notification delivery.
 */
export interface SignalEvent {
  eventId: string;
  ruleId: string;
  portfolioId?: string | null;
  instrumentId: string;
  signalType: SignalType;
  triggeredAt: Date;
  referencePrice: number;
  observedPrice: number;
  changeRate: number;
  threshold: number;
  status: SignalEventStatus;
  notificationStatus: NotificationStatus;
  deduplicationKey: string;
  message?: string | null;
  error?: string | null;
}
