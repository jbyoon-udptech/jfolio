import type { AuthProviderId, UserRole, UserStatus } from "@jfolio/shared";

/**
 * Persistence model for an internal user. Kept separate from the API response
 * type because it carries the password hash and account state.
 */
export interface User {
  userId: string;
  /** Canonical (trimmed, lower-cased) email. Unique. */
  email: string;
  name: string;
  /** bcrypt hash, or null for accounts that only use an external provider. */
  passwordHash: string | null;
  status: UserStatus;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * External authentication identity. One user may have several identities
 * (local + Google) while still sharing one internal account and session.
 */
export interface UserIdentity {
  identityId: string;
  userId: string;
  provider: AuthProviderId;
  providerUserId: string;
  createdAt: Date;
}

export function toAuthUser(user: User) {
  return {
    id: user.userId,
    email: user.email,
    name: user.name,
    role: user.role,
  };
}
