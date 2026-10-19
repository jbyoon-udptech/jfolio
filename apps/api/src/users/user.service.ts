import type { AuthProviderId, CreateUserInput } from "@jfolio/shared";
import { createUserSchema, normalizeEmail } from "@jfolio/shared";
import { newId } from "../domain/ids";
import { ConflictError, NotFoundError, ValidationError } from "../services/errors";
import type { UserRepository } from "./user.repository";
import { hashPassword, DEFAULT_BCRYPT_ROUNDS } from "./password";
import type { User } from "./user.types";

export type CreateLocalUserOptions = CreateUserInput;

/**
 * Account lifecycle. Sign-up is intentionally not exposed over HTTP: accounts
 * are created by an administrator or the `create-user` CLI (SPEC AUTH-006).
 */
export class UserService {
  constructor(
    private readonly repo: UserRepository,
    private readonly bcryptRounds = DEFAULT_BCRYPT_ROUNDS,
  ) {}

  async findById(userId: string): Promise<User | null> {
    return this.repo.findById(userId);
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.repo.findByEmail(normalizeEmail(email));
  }

  async createLocalUser(input: CreateLocalUserOptions): Promise<User> {
    // The service is also used by the admin CLI, so validation cannot live
    // only in the HTTP layer.
    const parsed = createUserSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid user input");
    }
    const data = parsed.data;
    const email = normalizeEmail(data.email);
    if (!email) throw new ValidationError("Email is required");

    const existing = await this.repo.findByEmail(email);
    if (existing) throw new ConflictError("A user with this email already exists");

    const now = new Date();
    const user: User = {
      userId: newId("usr"),
      email,
      name: data.name,
      passwordHash: await hashPassword(data.password, this.bcryptRounds),
      status: data.status,
      role: data.role,
      createdAt: now,
      updatedAt: now,
    };

    let created: User;
    try {
      created = await this.repo.create(user);
    } catch (error) {
      // The unique index is the source of truth under concurrent creation.
      if (isDuplicateKey(error)) throw new ConflictError("A user with this email already exists");
      throw error;
    }

    await this.repo.createIdentity({
      identityId: newId("idy"),
      userId: created.userId,
      provider: "local",
      // Local identities use the canonical email, per SPEC 4.2. Email changes
      // (not implemented initially) must update this value in the same step.
      providerUserId: created.email,
      createdAt: now,
    });

    return created;
  }

  async findIdentity(userId: string, provider: AuthProviderId) {
    return this.repo.findIdentityForUser(userId, provider);
  }

  async get(userId: string): Promise<User> {
    const user = await this.repo.findById(userId);
    if (!user) throw new NotFoundError(`User ${userId} not found`);
    return user;
  }
}

function isDuplicateKey(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: number }).code === 11000;
}
