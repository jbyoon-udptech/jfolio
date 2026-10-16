import type { COLLECTION_JOB_STATUSES } from "../constants/domain";

export type CollectionJobStatus = (typeof COLLECTION_JOB_STATUSES)[number];

/** FR-014: Per-run collection job record. */
export interface CollectionJob {
  jobId: string;
  providerId: string;
  assetType: string;
  startedAt: Date;
  finishedAt?: Date | null;
  status: CollectionJobStatus;
  targetCount: number;
  successCount: number;
  failureCount: number;
  error?: string | null;
}

/** FR-014: Long-lived provider health state. */
export interface ProviderState {
  providerId: string;
  lastRunAt?: Date | null;
  lastSuccessAt?: Date | null;
  lastErrorAt?: Date | null;
  consecutiveFailures: number;
  lastError?: string | null;
  targetCount: number;
  successCount: number;
  failureCount: number;
  /** Latest as-of time of data collected from this provider. */
  lastDataTimestamp?: Date | null;
}

/** Aggregate dashboard data status (FR-014 / UI-006). */
export interface DataStatusSummary {
  status: string;
  lastUpdatedAt: Date | null;
  latestQuoteAt: Date | null;
  latestCollectionAt: Date | null;
  providers: ProviderState[];
}
