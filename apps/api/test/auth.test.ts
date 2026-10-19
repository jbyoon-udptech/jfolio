import type { Express } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/api/app";
import type { AppConfig } from "../src/config";
import type { Container } from "../src/container";
import { createTestContext, FIXED_NOW } from "./helpers";
import { UserService } from "../src/users/user.service";
import { verifyPassword } from "../src/users/password";
import type { User } from "../src/users/user.types";

const BASE = "/api/v1";
const SESSION_COOKIE = "jfolio.sid";

interface AuthFixture {
  app: Express;
  container: Container;
  config: AppConfig;
  users: UserService;
}

function createAuthFixture(env: NodeJS.ProcessEnv = {}): AuthFixture {
  const { container, config } = createTestContext(FIXED_NOW, {
    AUTH_REQUIRED: "true",
    AUTH_LOCAL_ENABLED: "true",
    AUTH_BCRYPT_ROUNDS: "4",
    SESSION_SECRET: "test-session-secret-that-is-long-enough",
    SESSION_STORE: "memory",
    ...env,
  });
  return {
    app: createApp(container, config),
    container,
    config,
    users: new UserService(container.repos.users, config.auth.bcryptRounds),
  };
}

async function seedUser(
  users: UserService,
  overrides: Partial<{ email: string; name: string; password: string }> = {},
): Promise<User> {
  return users.createLocalUser({
    email: overrides.email ?? "alice@example.com",
    name: overrides.name ?? "Alice",
    password: overrides.password ?? "correct horse battery",
    role: "user",
    status: "active",
  });
}

function extractCookie(res: request.Response, name: string): string | undefined {
  const setCookie = res.headers["set-cookie"];
  const entries = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const entry = entries.find((value) => value.startsWith(`${name}=`));
  return entry?.split(";")[0]?.slice(name.length + 1);
}

type TestAgent = ReturnType<typeof request.agent>;

async function csrfFor(agent: TestAgent): Promise<string> {
  const res = await agent.get("/api/auth/csrf");
  expect(res.status).toBe(200);
  expect(typeof res.body.token).toBe("string");
  return res.body.token as string;
}

async function login(
  agent: TestAgent,
  email: string,
  password: string,
): Promise<request.Response> {
  const token = await csrfFor(agent);
  return agent
    .post("/api/auth/login")
    .set("x-csrf-token", token)
    .send({ email, password });
}

describe("AUTH-001..009 local login", () => {
  it("TEST-001 rejects protected API calls without a session", async () => {
    const { app } = createAuthFixture();
    const res = await request(app).get(`${BASE}/assets`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("TEST-002 logs in with valid credentials and exposes only a safe user", async () => {
    const { app, users } = createAuthFixture();
    await seedUser(users);
    const agent = request.agent(app);

    const res = await login(agent, "Alice@Example.com", "correct horse battery");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user).toMatchObject({ email: "alice@example.com", name: "Alice" });
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain("correct horse battery");

    const me = await agent.get("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.authenticated).toBe(true);
    expect(me.body.user.email).toBe("alice@example.com");

    const protectedRes = await agent.get(`${BASE}/assets`);
    expect(protectedRes.status).toBe(200);
  });

  it("TEST-003 rejects wrong passwords and unknown emails with the same response", async () => {
    const { app, users } = createAuthFixture();
    await seedUser(users);

    const wrongPassword = await login(request.agent(app), "alice@example.com", "wrong password");
    const unknownEmail = await login(request.agent(app), "nobody@example.com", "wrong password");

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
    expect(wrongPassword.body.error.message).toBe("Invalid email or password");
  });

  it("TEST-004 stores passwords as bcrypt hashes, never plaintext", async () => {
    const { container, users } = createAuthFixture();
    const user = await seedUser(users, { password: "a very secret passphrase" });
    const stored = await container.repos.users.findById(user.userId);

    expect(stored?.passwordHash).toBeTruthy();
    expect(stored?.passwordHash).not.toBe("a very secret passphrase");
    expect(stored?.passwordHash?.startsWith("$2")).toBe(true);
    expect(await verifyPassword("a very secret passphrase", stored!.passwordHash!)).toBe(true);
    expect(await verifyPassword("not the password", stored!.passwordHash!)).toBe(false);
  });

  it("TEST-005 sets a hardened session cookie on login", async () => {
    const { container, config } = createAuthFixture({
      SESSION_COOKIE_SECURE: "true",
      SESSION_COOKIE_SAMESITE: "lax",
      SESSION_TRUST_PROXY: "true",
    });
    const app = createApp(container, config);
    await seedUser(new UserService(container.repos.users, config.auth.bcryptRounds));

    // Cookies are handled manually because the Secure attribute prevents
    // supertest's jar from replaying them over plain HTTP.
    const csrfRes = await request(app)
      .get("/api/auth/csrf")
      .set("x-forwarded-proto", "https");
    const sid = extractCookie(csrfRes, SESSION_COOKIE);
    const token = csrfRes.body.token as string;
    expect(sid).toBeTruthy();

    const res = await request(app)
      .post("/api/auth/login")
      .set("Cookie", `${SESSION_COOKIE}=${sid}; jfolio.csrf=${token}`)
      .set("x-csrf-token", token)
      .set("x-forwarded-proto", "https")
      .send({ email: "alice@example.com", password: "correct horse battery" });

    expect(res.status).toBe(200);
    const cookies = res.headers["set-cookie"] as unknown as string[];
    const sessionCookie = cookies.find((value) => value.startsWith(`${SESSION_COOKIE}=`));
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie).toContain("HttpOnly");
    expect(sessionCookie).toContain("Secure");
    expect(sessionCookie).toContain("SameSite=Lax");
    expect(sessionCookie).toContain("Expires=");
    expect(sessionCookie).toMatch(/Path=\//);
  });

  it("TEST-006 regenerates the session id on login (fixation protection)", async () => {
    const { app, users } = createAuthFixture();
    await seedUser(users);
    const agent = request.agent(app);

    const first = await login(agent, "alice@example.com", "correct horse battery");
    const firstSid = extractCookie(first, SESSION_COOKIE);
    expect(firstSid).toBeTruthy();

    const second = await login(agent, "alice@example.com", "correct horse battery");
    const secondSid = extractCookie(second, SESSION_COOKIE);
    expect(secondSid).toBeTruthy();
    expect(secondSid).not.toBe(firstSid);

    // The pre-login session id must no longer authenticate.
    const replay = await request(app)
      .get(`${BASE}/assets`)
      .set("Cookie", `${SESSION_COOKIE}=${firstSid}`);
    expect(replay.status).toBe(401);

    const current = await agent.get(`${BASE}/assets`);
    expect(current.status).toBe(200);
  });

  it("TEST-007 logout destroys the server session and clears cookies", async () => {
    const { app, users } = createAuthFixture();
    await seedUser(users);
    const agent = request.agent(app);

    const loginRes = await login(agent, "alice@example.com", "correct horse battery");
    const sid = extractCookie(loginRes, SESSION_COOKIE);
    const token = await csrfFor(agent);

    const logout = await agent.post("/api/auth/logout").set("x-csrf-token", token);
    expect(logout.status).toBe(200);

    const me = await agent.get("/api/auth/me");
    expect(me.body.authenticated).toBe(false);

    const replay = await request(app)
      .get(`${BASE}/assets`)
      .set("Cookie", `${SESSION_COOKIE}=${sid}`);
    expect(replay.status).toBe(401);
  });

  it("TEST-008 requires a CSRF token for session-authenticated mutations", async () => {
    const { app, users } = createAuthFixture();
    await seedUser(users);
    const agent = request.agent(app);
    await login(agent, "alice@example.com", "correct horse battery");
    const token = await csrfFor(agent);

    const rejected = await agent
      .post(`${BASE}/portfolios`)
      .send({ name: "No CSRF", baseCurrency: "KRW" });
    expect(rejected.status).toBe(403);
    expect(rejected.body.error.code).toBe("FORBIDDEN");

    const wrong = await agent
      .post(`${BASE}/portfolios`)
      .set("x-csrf-token", "not-the-token")
      .send({ name: "Wrong CSRF", baseCurrency: "KRW" });
    expect(wrong.status).toBe(403);

    const accepted = await agent
      .post(`${BASE}/portfolios`)
      .set("x-csrf-token", token)
      .send({ name: "With CSRF", baseCurrency: "KRW" });
    expect(accepted.status).toBe(201);
    expect(accepted.body.name).toBe("With CSRF");
  });

  it("TEST-009 rate-limits repeated login attempts", async () => {
    const { app, users } = createAuthFixture({ AUTH_LOGIN_RATE_LIMIT_MAX: "2" });
    await seedUser(users);
    const agent = request.agent(app);

    const first = await login(agent, "alice@example.com", "wrong");
    const second = await login(agent, "alice@example.com", "wrong");
    const third = await login(agent, "alice@example.com", "wrong");

    expect(first.status).toBe(401);
    expect(second.status).toBe(401);
    expect(third.status).toBe(429);
    expect(third.body.error.code).toBe("RATE_LIMITED");
  });

  it("TEST-010 rejects disabled accounts without revealing the reason", async () => {
    const { app, container, config } = createAuthFixture();
    const users = new UserService(container.repos.users, config.auth.bcryptRounds);
    const user = await seedUser(users);
    await container.repos.users.update(user.userId, { status: "disabled" });

    const res = await login(request.agent(app), "alice@example.com", "correct horse battery");
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe("Invalid email or password");
  });

  it("TEST-011 expires sessions according to the configured max age", async () => {
    const { app, users } = createAuthFixture({ SESSION_MAX_AGE_MS: "1000" });
    await seedUser(users);
    const agent = request.agent(app);
    const res = await login(agent, "alice@example.com", "correct horse battery");
    expect(res.status).toBe(200);

    await new Promise((resolve) => setTimeout(resolve, 1500));
    const me = await agent.get("/api/auth/me");
    expect(me.body.authenticated).toBe(false);
  });

  it("TEST-012 keeps the API token working as a trusted service credential", async () => {
    const { app, users } = createAuthFixture({ API_AUTH_TOKEN: "service-secret" });
    await seedUser(users);

    const anonymous = await request(app).get(`${BASE}/assets`);
    expect(anonymous.status).toBe(401);

    const withToken = await request(app)
      .get(`${BASE}/assets`)
      .set("Authorization", "Bearer service-secret");
    expect(withToken.status).toBe(200);
  });
});

describe("account provisioning", () => {
  it("does not expose a public signup endpoint", async () => {
    const { app } = createAuthFixture();
    const res = await request(app).post("/api/auth/signup").send({});
    expect(res.status).toBe(404);
  });

  it("rejects duplicate emails and invalid passwords at creation time", async () => {
    const { users } = createAuthFixture();
    await seedUser(users);
    await expect(
      users.createLocalUser({
        email: "ALICE@example.com",
        name: "Other Alice",
        password: "correct horse battery",
        role: "user",
        status: "active",
      }),
    ).rejects.toThrow(/already exists/i);

    await expect(
      users.createLocalUser({
        email: "short@example.com",
        name: "Short",
        password: "short",
        role: "user",
        status: "active",
      }),
    ).rejects.toThrow();
  });

  it("advertises local auth and keeps Google disabled for Phase 1", async () => {
    const { app } = createAuthFixture();
    const res = await request(app).get("/api/auth/providers");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ local: true, google: false });
  });
});
