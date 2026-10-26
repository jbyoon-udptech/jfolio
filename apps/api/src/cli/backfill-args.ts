import {
  ASSET_TYPES,
  DATA_INTERVALS,
  type AssetType,
  type DataInterval,
} from "@jfolio/shared";

export interface BackfillCliOptions {
  from?: Date;
  to?: Date;
  days?: number;
  assetTypes?: AssetType[];
  instrumentIds?: string[];
  interval: DataInterval;
  help: boolean;
}

export const BACKFILL_USAGE = `Usage: yarn backfill:history [options]

Fetch daily historical quotes/FX rates for active instruments and store them in
MongoDB. Existing quotes are deduplicated, so the command is safe to rerun.

Options:
  --from <date>        Start date (ISO-8601 or YYYY-MM-DD). Default: one day
                       before each instrument's first transaction, or the
                       HISTORY_BACKFILL_DAYS window when there is no ledger.
  --to <date>          End date (inclusive for YYYY-MM-DD). Default: now.
  --days <n>           Look back N days instead of starting at the first trade.
  --asset-type <list>  Comma-separated asset types (STOCK, ETF, CRYPTO, FX, ...).
  --instrument <list>  Comma-separated instrument IDs.
  --interval <name>    Quote interval (default: 1d).
  -h, --help           Show this help.`;

/**
 * Parses CLI flags without touching config or the database, so the behavior is
 * unit-testable and bad input fails before a Mongo connection is opened.
 */
export function parseBackfillArgs(argv: string[]): BackfillCliOptions {
  const options: BackfillCliOptions = {
    interval: "1d",
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index] ?? "";
    const equals = raw.indexOf("=");
    const name = equals >= 0 ? raw.slice(0, equals) : raw;
    const inlineValue = equals >= 0 ? raw.slice(equals + 1) : undefined;

    if (name === "--help" || name === "-h") {
      return { ...options, help: true };
    }

    const value = (): string => {
      if (inlineValue !== undefined) return inlineValue;
      const next = argv[index + 1];
      if (next === undefined || next.startsWith("--")) {
        throw new Error(`Missing value for ${name}`);
      }
      index += 1;
      return next;
    };

    switch (name) {
      case "--from":
        options.from = parseDateArg(value(), "from", false);
        break;
      case "--to":
        options.to = parseDateArg(value(), "to", true);
        break;
      case "--days":
        options.days = parseDays(value());
        break;
      case "--asset-type":
        options.assetTypes = parseAssetTypes(value());
        break;
      case "--instrument":
        options.instrumentIds = parseInstrumentIds(value());
        break;
      case "--interval":
        options.interval = parseInterval(value());
        break;
      default:
        throw new Error(`Unknown option: ${raw}`);
    }
  }

  if (options.from && options.to && options.from.getTime() >= options.to.getTime()) {
    throw new Error("--from must be before --to");
  }
  return options;
}

function parseDateArg(value: string, flag: string, endOfDay: boolean): Date {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`--${flag} requires an ISO date`);

  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(trimmed);
  const date = new Date(dateOnly ? `${trimmed}T00:00:00.000Z` : trimmed);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid --${flag} date: ${value}`);
  }
  if (dateOnly && endOfDay) date.setUTCHours(23, 59, 59, 999);
  return date;
}

function parseDays(value: string): number {
  const days = Number(value);
  if (!Number.isInteger(days) || days <= 0) {
    throw new Error("--days must be a positive integer");
  }
  return days;
}

function parseAssetTypes(value: string): AssetType[] {
  const values = value
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
  if (values.length === 0) throw new Error("--asset-type requires at least one value");

  const types = values.map((item) => {
    if (!ASSET_TYPES.includes(item as AssetType)) {
      throw new Error(`Unknown asset type: ${item}`);
    }
    return item as AssetType;
  });
  return [...new Set(types)];
}

function parseInstrumentIds(value: string): string[] {
  const ids = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (ids.length === 0) throw new Error("--instrument requires at least one id");
  return [...new Set(ids)];
}

function parseInterval(value: string): DataInterval {
  const normalized = value.trim().toLowerCase();
  if (!DATA_INTERVALS.includes(normalized as DataInterval)) {
    throw new Error(`Unknown interval: ${value}`);
  }
  return normalized as DataInterval;
}
