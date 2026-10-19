import bcrypt from "bcryptjs";

/**
 * Cost used when hashing new passwords. Configurable so tests can run quickly;
 * production defaults to 12 (see `AUTH_BCRYPT_ROUNDS`).
 */
export const DEFAULT_BCRYPT_ROUNDS = 12;

/**
 * A valid bcrypt hash used to equalise timing when the account does not exist
 * or has no local password. The plaintext is irrelevant and never accepted.
 */
const DUMMY_HASH = "$2b$12$.qsS96pn8uPXfKvzHAdsZ.w2CJEaQ7uHkUExqwg9bY5hs6wqJ6LHG";

export async function hashPassword(password: string, rounds = DEFAULT_BCRYPT_ROUNDS): Promise<string> {
  return bcrypt.hash(password, rounds);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** Burn a comparable amount of time for unknown accounts (user enumeration). */
export async function verifyDummyPassword(password: string): Promise<void> {
  await bcrypt.compare(password, DUMMY_HASH);
}
