/** Roles supported by the initial authentication implementation. */
export type UserRole = "user" | "admin";

/** Account states. A disabled account cannot authenticate. */
export type UserStatus = "active" | "disabled";

/** Authentication providers. Google is reserved for Phase 2. */
export type AuthProviderId = "local" | "google";

/**
 * Safe user representation returned by the auth API. Deliberately excludes
 * `passwordHash` and any session/provider internals.
 */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export interface LoginResponse {
  success: true;
  user: AuthUser;
}

export interface LogoutResponse {
  success: true;
}

export interface MeResponse {
  authenticated: boolean;
  user: AuthUser | null;
}
