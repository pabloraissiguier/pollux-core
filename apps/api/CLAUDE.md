# CLAUDE.md: apps/api

This file covers the API app only. Product context, the domain and the repo layout are in the root `CLAUDE.md`.

## Commands

Run from `apps/api/` (or from the root with `pnpm --filter api <script>`). Migrations are run from the root: see `db/CLAUDE.md`.

```bash
pnpm dev                                  # Node server with reload, http://localhost:3001 (API_PORT), against Supabase
pnpm test                                 # whole suite; needs `docker compose up -d db` (root)
pnpm exec vitest run test/me.test.ts      # one file
pnpm exec vitest run -t "creates the profile"   # tests whose name matches
pnpm lint
pnpm typecheck
pnpm exec hono routes                     # list routes (loads src/index.ts)
export TOKEN=$(pnpm --silent dev:token)   # Supabase access token for TEST_USER/TEST_PASS from .env
```

The suite builds its own app and never reads `DATABASE_URL`; the vitest config removes it from the test process. It uses `TEST_DATABASE_URL` (default `postgres://pollux:pollux@localhost:5433/pollux_test`), which must be local and name a `*test*` database, because every run drops and recreates it.

### Trying the app by hand

- **In-process, against the local test DB** (preferred for writes). `API_AUTH_VERIFIER=test` selects the test verifier, where the bearer token is just a user id; pass the id through an env var:
  ```bash
  API_AUTH_VERIFIER=test DATABASE_URL=postgres://pollux:pollux@localhost:5433/pollux_test \
    pnpm exec hono request /me -H "Authorization: Bearer $USER_ID"
  ```
- **Real sign-in against Supabase** (the manual check for auth): `pnpm dev`, then `export TOKEN=$(pnpm --silent dev:token)` and `curl localhost:3001/me -H "Authorization: Bearer $TOKEN"`. It answers with the Gio Pack business for the seeded `TEST_USER`.

## Structure

- `src/app.ts`: **`createApp({ db, verifyToken, corsOrigins })`**, the app factory, and `AppType`. It mounts CORS first, then the session middleware and every module router, chained. It throws if given the test verifier when `NODE_ENV=production`.
- `src/index.ts`: the app built from env, exported as default. It is the entry for the Hono CLI and for Vercel (whose Hono support serves the default export of `src/index.ts`; on Vercel it uses `DATABASE_POOLER_URL` with `prepare: false`). `src/server.ts` serves it on Node.
- `src/auth/verifier.ts`: the Supabase verifier (JWKS at `<SUPABASE_URL>/auth/v1/.well-known/jwks.json`, issuer `<SUPABASE_URL>/auth/v1`, audience `authenticated`) and the test verifier.
- `src/auth/session.ts`: the **session** middleware (token → 401, first-sight `profiles` row, business from `X-Business-Id` → 403 unless a member, or the only membership) and **`requireBusiness`**. Mount `requireBusiness` on every business-scoped router: it guarantees `c.var.businessId` is a string (403 `no_business`, 400 `business_not_selected`). `/me` is the only route without it.
- `src/routes/<module>.ts`: one Hono sub-router per module, mounted in `createApp`.
- **CORS** runs before the session, so a preflight `OPTIONS` never needs a token, and error responses (401, 403, 400, 404) carry the CORS headers so the dashboard can read `{ error }`. Allowed origins come from **`API_CORS_ORIGINS`** (comma-separated, exact match, default `http://localhost:3010`) in `src/env.ts`; an unlisted origin gets no `Access-Control-Allow-Origin`. Allowed headers: `Authorization`, `Content-Type`, `X-Business-Id`; methods: GET, POST, PUT, PATCH, DELETE. When the dashboard runs on a new origin (a Playwright port, a Vercel domain), add it to the variable. Tests pass origins directly: `setupTestApp({ corsOrigins })`.
- `src/errors.ts`: `ApiError` and the error handler. `src/validator.ts`: `validate(target, schema)`, the `zValidator` wrapper to use for every request schema.
- `src/pg-errors.ts`: `isUniqueViolation(err, constraint)`. Turn a per-business unique constraint into a 409 by catching the write (`.catch(...)`) and checking the constraint name, rather than checking first (two requests can race).
- **Catalog** (`routes/categories.ts`, `routes/products.ts`, services of the same names):
  - `/categories`: list, create, `PATCH /:id` rename. A name that is already taken is 409 `category_name_taken`.
  - `/products`: list (`q` matches name, Code or Brand; `categoryId`; `active=true|false`, both when left out), create, detail, `PATCH /:id`. A Code that is already taken is 409 `product_code_taken`, and a missing or other-tenant Category is 404 `category_not_found`.
  - **No delete:** `PATCH { isActive: false }` makes a Product Inactive, and `true` reactivates it.
  - **Price changes go through `PATCH { price }`:** the Product row is locked `FOR UPDATE`, and when the Price differs, one `product_price_changes` row (old, new, who) is written in the same transaction. Creating a Product writes its first row (`oldPrice: null`). `GET /products/:id/price-history` lists them newest first, with `changedBy: { id, fullName }`. Category Price updates should write their history through the same `recordPriceChange` in `services/products.ts`.
- `test/`: `global-setup.ts` prepares the test DB; `fixtures.ts` has `setupTestApp({ corsOrigins? })` (users, businesses, `request(path, { as, businessId })`).

## Stack

| Concern | Choice |
|---|---|
| HTTP framework | **Hono** (TypeScript) |
| Database access and migrations | **Drizzle ORM** + **drizzle-kit** |
| Validation | **Zod**, through `@hono/zod-validator` |
| Tests | **Vitest** |
| Package manager | **pnpm workspaces** (the API and dashboard share types and Zod schemas) |

## Why these choices

- **Hono deploys almost anywhere.** The same code runs as a Node server (`@hono/node-server`, for Docker) and as Vercel functions. Hosting isn't decided, so the API must not depend on one runtime.
- **Hono's RPC client (`hc`)** gives `apps/dashboard` typed API calls taken straight from the route definitions, with no OpenAPI or codegen step. This is the main reason we chose Hono over Express or Fastify.
- **NestJS was rejected** as too much structure for a POC.
- **Drizzle stays close to SQL.** The core flows (an order reduces stock and adds a ledger debit; a payment adds a ledger credit) need explicit transactions, row locks and exact numeric types. Prisma hides too much of this.
- **drizzle-kit writes plain SQL migrations**, which works the same on plain Postgres and on Supabase (that choice is still open).
- **Drizzle suits serverless functions** like Vercel's: it starts fast and needs no separate engine.

### When to reconsider
- If we commit to a long-running server only (no serverless), **Fastify** is a fair alternative.
- If one deployment matters more than a separate API, Nuxt server routes (Nitro) could replace this app. The current decision is to keep the API separate.

## Conventions

- **The schema and migrations live in the repo-level `db/` package (`@pollux/db`), not in this app.** Import tables from `@pollux/db/schema`; never define tables here. See `db/CLAUDE.md`.
- **Money is `numeric(14,2)`**: never JS floats or `real`/`double` columns. Handle amounts as strings or decimals in code, not as `number`.
- **A customer's Balance is the sum of their `balance_entries`**, never a stored column. Entries and stock movements are insert-only: fixes are new reversing rows (see `docs/adr/0001`).
- **Reserved stock is derived** from lines of Pending Orders; `products.stock_on_hand` is a cache updated in the same transaction as each `stock_movements` insert.
- **Order and Delivery note numbers** come from `app.business_sequences` (`UPDATE ... SET last_value = last_value + 1 RETURNING last_value`) inside the transaction that needs them.
- **Stock and ledger changes happen in one transaction** with the order, delivery or payment that caused them. Lock the stock rows you change (`SELECT ... FOR UPDATE`) so two orders placed at once can't take the same stock.
- **Every request is tenant-scoped.** Middleware authenticates the user (Supabase Auth JWT), resolves the active `business_id` and checks it against `app.business_members`. That `business_id` goes on the request context, and **every query filters by it**. Never take `business_id` from a request body without checking membership. Tenant isolation lives here, not in RLS (see `db/CLAUDE.md`).
- **The payment method belongs to the delivery or payment, not the customer** (see the root `CLAUDE.md`). Never model customer "types" for cuenta corriente vs. contado.
- **Export the app's type** (`export type AppType = typeof app`) so the dashboard can use it with `hc<AppType>()`. Chain route definitions so the types carry through.
- **Put Zod request schemas that the dashboard also uses** (e.g. order forms) in `@pollux/contracts` (`packages/contracts`), next to the enum values, `cuitSchema` and the money helpers.
- **Errors are `{ error: { code, message, details? } }`**: throw an `ApiError(status, code, message)` with a stable English slug and a Spanish message. Validation errors are 400 `validation_error` with `details` mapping each field path to its messages. Zod's own messages are in Spanish (`z.locales.es()`, set in `src/app.ts`).

## Tests

- **One seam: HTTP through the factory.** Each test file calls `setupTestApp()`, creates its own business with the fixtures, and drives everything else with `request(...)`. Assert on responses and later reads; leave services and tables out of assertions. Only setup data (users, businesses, memberships) is inserted directly.
- **Test names describe business behavior** in `GLOSSARY.md` terms.
- `packages/contracts` has its own unit tests (`pnpm --filter @pollux/contracts test`) for the CUIT and money helpers.

## Hono guidance and tooling

- **Use the `hono` skill** for Hono APIs (routing, middleware, validation, RPC client, testing). For anything beyond it, fetch the current docs from hono.dev as the skill describes, rather than relying on memory.
- **Hono CLI (`@hono/cli`) for quick checks, Vitest for proof.** Use `hono routes`, `hono request` and `hono batch` to inspect routes and try flows in-process while building, instead of throwaway scripts or a running dev server. They don't replace tests: a ticket's behavior is proven by Vitest HTTP tests against the local test Postgres.
- **pnpm, not npm:** it's a dev dependency of this app, run with `pnpm exec hono …`, not with the `npm`/`npx` commands the skill shows. It's pinned to the `1.0.0-rc` line (`@hono/cli@next`), because the stable `0.1.x` has no `routes`, `batch` or `snapshot`. Move to the stable release once 1.0 ships.
- **The CLI needs a default app module.** The app is built by a factory, so the module the CLI loads (default `src/index.ts`) must build a ready app from env: the DB from `.env`, and the real Supabase verifier unless a dev flag selects the test verifier. Point it at the local test DB, not Supabase, when trying writes. Never pass tokens or passwords as CLI arguments; use env vars, as the skill says.
