import type { AppConfig } from "../config";
import type { UserRepository } from "../users/user.repository";
import type { User } from "../users/user.types";
import { LocalAuthProvider, type AuthProvider } from "./providers/local.provider";

/**
 * Authentication orchestration. Providers only establish *who* the caller is;
 * account status and session handling are decided here so future providers
 * share exactly the same post-authentication rules.
 */
export class AuthService {
  private readonly localProvider: LocalAuthProvider;

  constructor(
    users: UserRepository,
    private readonly config: AppConfig,
  ) {
    this.localProvider = new LocalAuthProvider(users);
  }

  get localEnabled(): boolean {
    return this.config.auth.localEnabled;
  }

  get googleEnabled(): boolean {
    return this.config.auth.googleEnabled;
  }

  /**
   * Returns an active user for valid local credentials, or null for every
   * failure mode (unknown email, wrong password, disabled account). Callers
   * must not distinguish these cases in the response.
   */
  async loginWithLocal(email: string, password: string): Promise<User | null> {
    if (!this.localEnabled) return null;
    const user = await this.localProvider.authenticate({ email, password });
    if (!user) return null;
    if (user.status !== "active") return null;
    return user;
  }

  /** Phase 2 providers will implement this same boundary. */
  get providers(): AuthProvider[] {
    return [this.localProvider];
  }
}
