import { randomBytes } from "node:crypto";
import type { Request, RequestHandler, Response } from "express";
import session from "express-session";
import MongoStore from "connect-mongo";
import type { AppConfig } from "../config";
import "./auth.types";

/** Opaque token used for the double-submit CSRF scheme. */
export function createCsrfToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Session middleware. Production uses the Mongo-backed store; tests use the
 * in-memory default because they never cross a process boundary. Config
 * validation rejects `SESSION_STORE=memory` in production.
 */
export function createSessionMiddleware(config: AppConfig): RequestHandler {
  const sessionConfig = config.auth.session;
  const store =
    sessionConfig.store === "mongo"
      ? MongoStore.create({
          mongoUrl: config.mongo.uri,
          dbName: config.mongo.dbName,
          collectionName: "sessions",
          ttl: Math.ceil(sessionConfig.maxAgeMs / 1000),
        })
      : undefined;

  return session({
    name: sessionConfig.cookieName,
    secret: sessionConfig.secret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    proxy: sessionConfig.trustProxy,
    store,
    cookie: {
      path: "/",
      httpOnly: true,
      secure: sessionConfig.secure,
      sameSite: sessionConfig.sameSite,
      maxAge: sessionConfig.maxAgeMs,
    },
  }) as unknown as RequestHandler;
}

/** Publish the CSRF token in a readable cookie for the double-submit check. */
export function setCsrfCookie(res: Response, config: AppConfig, token: string): void {
  res.cookie(config.auth.session.csrfCookieName, token, {
    path: "/",
    httpOnly: false,
    secure: config.auth.session.secure,
    sameSite: config.auth.session.sameSite,
    maxAge: config.auth.session.maxAgeMs,
  });
}

export function clearAuthCookies(res: Response, config: AppConfig): void {
  const options = {
    path: "/",
    httpOnly: true,
    secure: config.auth.session.secure,
    sameSite: config.auth.session.sameSite,
  } as const;
  res.clearCookie(config.auth.session.cookieName, options);
  res.clearCookie(config.auth.session.csrfCookieName, options);
}

export function regenerateSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => (error ? reject(error) : resolve()));
  });
}

export function saveSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.save((error) => (error ? reject(error) : resolve()));
  });
}

export function destroySession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.destroy((error) => (error ? reject(error) : resolve()));
  });
}
