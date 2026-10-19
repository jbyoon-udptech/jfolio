import type { AuthProviderId } from "@jfolio/shared";
import type { User } from "../users/user.types";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Authenticated internal user, attached by the session middleware. */
      user?: User;
      /** How the current request was authenticated. */
      authMethod?: "session" | "api-token";
    }
  }
}

declare module "express-session" {
  /** Session payload stored server-side. Never contains credentials. */
  interface SessionData {
    userId?: string;
    csrfToken?: string;
  }
}

export interface GoogleProfile {
  /** OIDC `sub` claim: the stable external identifier. */
  sub: string;
  email: string;
  name: string;
}

/** Contract reserved for the Phase 2 Google provider. */
export interface GoogleAuthProvider {
  readonly id: Extract<AuthProviderId, "google">;
  getAuthorizationUrl(state: string, nonce: string): string;
  exchangeCode(code: string, expected: { state: string; nonce: string }): Promise<GoogleProfile>;
}

export const SESSION_COOKIE_SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
