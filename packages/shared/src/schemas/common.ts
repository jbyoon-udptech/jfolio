import { z } from "zod";
import {
  ASSET_TYPES,
  DATA_INTERVALS,
  TRANSACTION_TYPES,
  SIGNAL_TYPES,
  REFERENCE_TYPES,
  SNAPSHOT_TYPES,
} from "../constants/domain";

/** ISO-8601 date-time string, coerced to a Date. */
export const isoDate = z
  .string()
  .datetime({ offset: true })
  .transform((value) => new Date(value));

/** Accepts an ISO string or a Date and always yields a Date. */
export const dateLike = z.union([z.date(), isoDate]);

export const currencyCode = z
  .string()
  .trim()
  .regex(/^[A-Z]{3,5}$/, "ISO 4217 currency code expected (e.g. KRW, USD, USDT)");

export const assetTypeSchema = z.enum(ASSET_TYPES);
export const dataIntervalSchema = z.enum(DATA_INTERVALS);
export const transactionTypeSchema = z.enum(TRANSACTION_TYPES);
export const signalTypeSchema = z.enum(SIGNAL_TYPES);
export const referenceTypeSchema = z.enum(REFERENCE_TYPES);
export const snapshotTypeSchema = z.enum(SNAPSHOT_TYPES);

/**
 * Query-string booleans. Note: `z.coerce.boolean()` is unsafe for query strings
 * because `Boolean("false") === true`, so we parse the accepted literals
 * explicitly.
 */
export const booleanQuery = z
  .union([z.boolean(), z.enum(["true", "false", "1", "0"])])
  .transform((value) => value === true || value === "true" || value === "1");

export const paginationQuery = z.object({
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});
