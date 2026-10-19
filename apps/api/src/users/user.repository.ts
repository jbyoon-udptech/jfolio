import type { AuthProviderId } from "@jfolio/shared";
import type { User, UserIdentity } from "./user.types";

/** Read/write operations required by the auth layer. */
export interface UserRepository {
  create(user: User): Promise<User>;
  update(userId: string, patch: Partial<User>): Promise<User | null>;
  findById(userId: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;

  createIdentity(identity: UserIdentity): Promise<UserIdentity>;
  findIdentity(provider: AuthProviderId, providerUserId: string): Promise<UserIdentity | null>;
  findIdentityForUser(userId: string, provider: AuthProviderId): Promise<UserIdentity | null>;
}
