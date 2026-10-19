import { createUserSchema } from "@jfolio/shared";
import { config } from "../config";
import { connectMongo, disconnectMongo } from "../db/mongo";
import { createMongoRepositories } from "../repositories/mongo";
import { UserService } from "../users/user.service";

/**
 * Creates a local account. Sign-up is intentionally not exposed over HTTP, so
 * the first (and any additional) account is provisioned by an administrator:
 *
 *   CREATE_USER_PASSWORD='...' yarn create-user --email you@example.com --name "You"
 *   printf '%s' '...' | yarn create-user --email ... --password-stdin
 *
 * Passwords are read from the environment/stdin so they never appear in the
 * process list or shell history.
 */
function readArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
}

async function resolvePassword(): Promise<string> {
  const fromEnv = process.env.CREATE_USER_PASSWORD;
  if (fromEnv) return fromEnv;
  if (process.argv.includes("--password-stdin") || !process.stdin.isTTY) {
    const value = await readStdin();
    if (value) return value;
  }
  throw new Error(
    "Provide the password via CREATE_USER_PASSWORD or pipe it with --password-stdin",
  );
}

async function main(): Promise<void> {
  const input = createUserSchema.safeParse({
    email: readArg("email"),
    name: readArg("name"),
    role: readArg("role") ?? "user",
    status: readArg("status") ?? "active",
    password: await resolvePassword(),
  });
  if (!input.success) {
    // eslint-disable-next-line no-console
    console.error("[create-user] invalid input:", input.error.flatten().fieldErrors);
    process.exitCode = 1;
    return;
  }

  const db = await connectMongo({ uri: config.mongo.uri, dbName: config.mongo.dbName });
  const repos = createMongoRepositories(db);
  const users = new UserService(repos.users, config.auth.bcryptRounds);
  const user = await users.createLocalUser(input.data);

  // Never print the password or its hash.
  // eslint-disable-next-line no-console
  console.log(`[create-user] created ${user.email} (${user.userId}) role=${user.role}`);
  await disconnectMongo();
}

main().catch(async (error) => {
  // eslint-disable-next-line no-console
  console.error("[create-user] failed:", error instanceof Error ? error.message : error);
  await disconnectMongo().catch(() => undefined);
  process.exit(1);
});
