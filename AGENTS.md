# AGENTS.md

jFolio: personal multi-asset portfolio manager. Yarn 1 workspaces monorepo,
Node >= 20, TypeScript strict. Product docs and UI strings are Korean; code and
comments are English.

## Commands (run from the repo root)

| Command | What it does |
| --- | --- |
| `yarn install` | Install all workspaces |
| `yarn dev` | API (`:3001`) + Next.js (`:3000`) concurrently |
| `yarn dev:api` / `yarn dev:web` | Run one side (`tsx watch` / `next dev`) |
| `yarn build` | shared typecheck → API `tsup` → web `next build` |
| `yarn typecheck` / `yarn lint` | All workspaces / ESLint from the root |
| `yarn test` | shared + API + web Vitest suites |
| `yarn test:api` / `yarn test:web` | One workspace |
| `yarn workspace @jfolio/api test test/financial.test.ts` | One test file |
| `yarn workspace @jfolio/api test:watch` | Watch mode |
| `yarn seed` / `yarn collect:once` | Seed DB + one live collection / one collection |
| `yarn create-user ...` | Create a login account via CLI |

There is no CI or pre-commit hook; run lint, typecheck, and tests locally.

## Setup and environment gotchas

- MongoDB is required by `yarn dev`, `yarn seed`, and `yarn create-user` (the API
  connects on startup). Tests need neither MongoDB nor network: they use
  in-memory repositories, mock providers, and a fixed clock.
- The API loads the **repo-root `.env`** explicitly (`apps/api/src/config/env.ts`).
  Next.js does **not** read that file. Web-side variables (`API_BASE_URL`,
  `API_AUTH_URL`, `API_AUTH_TOKEN`, `AUTH_REQUIRED`, `SESSION_COOKIE_NAME`,
  `AUTH_CSRF_COOKIE_NAME`, `NEXT_PUBLIC_TIME_ZONE`) must come from the shell or
  `apps/web/.env*` in local dev. In production PM2 injects the uploaded
  `<DEPLOY_PATH>/.env` into both processes.
- Auth is on by default (`AUTH_REQUIRED=true`) and there is no signup. Create an
  account with:
  `CREATE_USER_PASSWORD='...' yarn create-user --email you@example.com --name "You"`
  (or `--password-stdin` to avoid shell history). `AUTH_REQUIRED=false` is a
  legacy no-auth mode; never use it in production.
- Production config is validated at startup: `SESSION_SECRET` must be >= 32
  chars and `SESSION_STORE=memory` is rejected.
- `yarn seed` attempts a live collection (best-effort; failure only warns) unless
  `STOCK_PROVIDER` / `CRYPTO_PROVIDER` / `FX_PROVIDER` are `mock`. It is
  idempotent; demo transactions are only created when the default portfolio is
  empty.

## Architecture and wiring

- `packages/shared` is **source-only** (`main`/`types` = `src/index.ts`). Do not
  add a build step. API bundles it with tsup `noExternal`; web uses Next
  `transpilePackages`.
- API layering: `api/routes` → `services` → `repositories`; dependencies are
  assembled in `apps/api/src/container.ts`. Every repository has **two**
  implementations (`repositories/memory` and `repositories/mongo`); a new method
  must be added to both. Indexes live in `db/collections.ts` and are created
  best-effort on connect.
- Validate requests with Zod schemas from `packages/shared/src/schemas` via
  `parseBody`/`parseQuery`. Errors use the envelope
  `{ error: { code, message, details? } }`.
- Web data access is server-side only through `apps/web/src/lib/api.ts`. Browser
  mutations POST to same-origin Next route handlers under
  `apps/web/src/app/api/**`, which call the API with the service token and run
  `guardMutation` (session + CSRF). Never call the API directly from client
  components or expose `API_AUTH_TOKEN` via `NEXT_PUBLIC_*`.
- Auth routes live at `/api/auth`, outside `/api/v1`. Session-authenticated
  mutations require the double-submit CSRF pair: `jfolio.csrf` cookie →
  `x-csrf-token` header. Both the Next guard and the API enforce it; requests
  authenticated with the `API_AUTH_TOKEN` service credential skip CSRF, so never
  treat the Next server as a CSRF boundary.
- Adding an endpoint: shared Zod schema → router (`apps/api/src/api/routes`) →
  service → repository (both impls) → `apps/api/test/api.test.ts` → web client
  method if used.

## Domain invariants (easy to break)

- All money math goes through `decimal.js` helpers in
  `apps/api/src/domain/money.ts`; do not use raw JS float arithmetic.
- Missing FX/invalid valuation is `UNAVAILABLE`/`null`, never `0`, and is
  excluded from totals (`dailyChange` is `null` when the base valuation is
  unavailable).
- `latest_quotes` is a materialized per-instrument collection; never overwrite a
  newer quote with an older/late-arriving one.
- Deduplication keys: quotes `instrumentId+providerId+interval+timestamp`,
  signal events `ruleId+deduplicationKey`.
- Auth users exist, but portfolio/transaction data is still shared under
  `DEFAULT_USER_ID`; do not assume per-user isolation.
- Cost basis is moving average with buy fees included. Cash is an
  `assetType=CASH` instrument (price 1); non-cash trades do not auto-adjust cash
  — use `DEPOSIT`/`WITHDRAWAL`.

## Testing notes

- Vitest with `globals: false`: import `describe/it/expect` from `vitest`.
- API integration tests mount the app via `createApp(container)`; build contexts
  with `createTestContext` / `createTestConfig` from `apps/api/test/helpers.ts`
  (memory repos, mock providers, `FIXED_NOW`). Use these instead of real Mongo,
  wall-clock time, or network calls.
- `createTestConfig` defaults to `AUTH_REQUIRED=false` for legacy route tests;
  auth tests pass `AUTH_REQUIRED=true`, `SESSION_STORE=memory`,
  `AUTH_BCRYPT_ROUNDS=4` (see `apps/api/test/auth.test.ts`).
- Web tests cover pure utilities only (`apps/web/test/*.test.ts`); there is no
  browser/E2E suite.

## Deployment

- `./deploy.sh production` builds locally, assembles `.deploy/<target>/`, rsyncs
  to the OCI host, and reloads PM2 (`ecosystem.config.cjs`).
- `./deploy-nginx.sh production` is the one-time/idempotent TLS bootstrap
  (nginx + certbot webroot, `deploy/nginx/*.template`). It needs `NGINX_DOMAIN`
  and `NGINX_ACME_EMAIL` in `deploy/<target>.env`.
- Production cookies (`jfolio.sid`, `jfolio.csrf`) are `Secure`, so the site
  must be served over HTTPS. Plain HTTP makes browsers drop them, the API never
  issues a session cookie, and every login fails with
  `403 A valid CSRF token is required`. `SESSION_COOKIE_SECURE=false` is only a
  stop-gap for a deliberately non-TLS deployment.
- Next.js binds to `127.0.0.1:3000`; only 80/443 should be public.
- Requires `deploy/<target>.env` (SSH/build-time vars) and
  `deploy/<target>.app.env` (uploaded as `<DEPLOY_PATH>/.env`). Both are
  gitignored; copy the committed `*.example` files and never commit real ones.
- `--skip-build` reuses `apps/api/dist` + `apps/web/.next`; `--seed` additionally
  requires `apps/api/dist/cli/seed.js` (run a full build first).
- `NEXT_PUBLIC_*` values are baked in at build time from `deploy/<target>.env`.
- `yarn create-user` is dev-only; on the server run
  `node apps/api/dist/cli/create-user.js ...`.

## Docs

`README.md` is the operational guide. `docs/DEVELOPMENT.md`, `docs/API.md`,
`docs/DATA_MODEL.md`, and `docs/IMPLEMENTATION_REPORT.md` hold design detail.
Root `SPEC.md` is a byte-identical copy of `docs/SPEC.md`; edit both or neither.
