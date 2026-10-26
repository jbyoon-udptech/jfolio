export interface BackupCliOptions {
  out?: string;
  collections?: string[];
  exclude: string[];
  gzip: boolean;
  help: boolean;
}

export const BACKUP_USAGE = `Usage: yarn backup [options]

Create a logical backup of the current jFolio MongoDB database. Every selected
collection is written as a MongoDB Extended JSON array, plus manifest.json.

Options:
  --out <dir>          Output directory (default: backup/jfolio-backup-<timestamp>)
  --collection <list>  Comma-separated collections to include (default: all)
  --exclude <list>     Comma-separated collections to skip (e.g. sessions)
  --gzip               Compress each collection file with gzip (.json.gz)
  -h, --help           Show this help.

The output directory is created with mode 0700 and files with mode 0600 because
the dump may contain password hashes and session data.`;

/**
 * Parses backup flags without touching config or MongoDB, so the behavior is
 * unit-testable and invalid input fails before a connection is opened.
 */
export function parseBackupArgs(argv: string[]): BackupCliOptions {
  const options: BackupCliOptions = {
    exclude: [],
    gzip: false,
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

    if (name === "--gzip") {
      if (inlineValue !== undefined) {
        throw new Error("--gzip does not take a value");
      }
      options.gzip = true;
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
      case "--out": {
        const out = value().trim();
        if (!out) throw new Error("--out requires a directory");
        options.out = out;
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
