import type { AuthProviderId } from "@jfolio/shared";
import { normalizeEmail } from "@jfolio/shared";
import type { UserRepository } from "../../users/user.repository";
import { verifyDummyPassword, verifyPassword } from "../../users/password";
import type { User } from "../../users/user.types";

export interface LocalCredentials {
  email: string;
  password: string;
}

/**
 * Credential verification strategy. The interface is intentionally narrow so a
 * Google provider (Phase 2) can be added without changing AuthService, the
 * session layer or the HTTP routes.
 */
export interface AuthProvider {
  readonly id: AuthProviderId;
  authenticate(credentials: LocalCredentials): Promise<User | null>;
}

/** SPEC 3.2 local provider: email + password against the internal user store. */
export class LocalAuthProvider implements AuthProvider {
  readonly id: AuthProviderId = "local";

  constructor(private readonly users: UserRepository) {}

  async authenticate({ email, password }: LocalCredentials): Promise<User | null> {
    const user = await this.users.findByEmail(normalizeEmail(email));

    // Always perform a bcrypt comparison so missing/local-less accounts do not
    // reveal their existence through a timing difference.
    if (!user || !user.passwordHash) {
      await verifyDummyPassword(password);
      return null;
    }

    const valid = await verifyPassword(password, user.passwordHash);
    return valid ? user : null;
  }
}
