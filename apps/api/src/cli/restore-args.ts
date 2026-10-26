export interface RestoreCliOptions {
  dir?: string;
  collections?: string[];
  exclude: string[];
  drop: boolean;
  dryRun: boolean;
  help: boolean;
}

export const RESTORE_USAGE = `Usage: yarn restore --dir <backup-dir> [options]

Restore a logical backup created by \`yarn backup\`.

Options:
  --dir <dir>          Backup directory containing manifest.json (required)
  --collection <list>  Comma-separated collections to restore (default: all)
  --exclude <list>     Comma-separated collections to skip
  --drop               Drop each selected collection before restoring it
  --dry-run            Validate the manifest/files without writing to MongoDB
  -h, --help           Show this help.

Without --drop, documents are upserted by _id, so documents that exist only in
the target database are left untouched. With --drop, the selected collections
are replaced exactly by the backup contents. Stop the API and scheduler before
a destructive restore; --drop also removes indexes, so the CLI recreates the
known application indexes afterwards.`;

/**
 * Parses restore flags without touching config or MongoDB, so invalid input
 * fails before a connection is opened.
 */
export function parseRestoreArgs(argv: string[]): RestoreCliOptions {
  const options: RestoreCliOptions = {
    exclude: [],
    drop: false,
    dryRun: false,
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

    if (name === "--drop") {
      if (inlineValue !== undefined) {
        throw new Error("--drop does not take a value");
      }
      options.drop = true;
      continue;
    }

    if (name === "--dry-run") {
      if (inlineValue !== undefined) {
        throw new Error("--dry-run does not take a value");
      }
      options.dryRun = true;
      continue;
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
      case "--dir": {
        const dir = value().trim();
        if (!dir) throw new Error("--dir requires a backup directory");
        options.dir = dir;
        break;
      }
      case "--collection":
        options.collections = append(
          options.collections,
          parseCollectionList(value(), name),
        );
        break;
      case "--exclude":
        options.exclude = append(options.exclude, parseCollectionList(value(), name));
        break;
      default:
        throw new Error(`Unknown option: ${raw}`);
    }
  }

  if (!options.dir) {
    throw new Error("Missing required option: --dir");
  }
  if (options.collections) {
    options.collections = [...new Set(options.collections)];
  }
  options.exclude = [...new Set(options.exclude)];
  return options;
}

function parseCollectionList(value: string, flag: string): string[] {
  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (items.length === 0) {
    throw new Error(`${flag} requires at least one collection name`);
  }
  return items;
}

function append(current: string[] | undefined, next: string[]): string[] {
  return [...(current ?? []), ...next];
}
