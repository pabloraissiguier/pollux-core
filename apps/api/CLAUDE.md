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
- `src/routes/<module>.ts`: one Hono sub-router per module, mounted in `createApp`. Handlers only validate (`validate(...)` on `param`, `query`, `json`) and delegate.
- `src/services/<module>.ts`: the module's service functions, taking `(db, businessId, ...)`. Every query filters by `businessId`; a missing or other-tenant row throws a 404 `ApiError` (`customer_not_found`, `branch_not_found`).
- `/customers` (`routes/customers.ts`): list (`q` searches name, legal name and CUIT with or without dashes; `town` matches any Branch's city, case-insensitive), `GET /towns` (the business's Localidades as `{ items: string[] }`: each Branch city once, case variants merged into the most used spelling, sorted with `Intl.Collator('es-AR')` in code rather than by the DB collation; not paginated), create (with at least one Branch), detail, `PATCH` details, `POST /:id/branches`, `PATCH /:id/branches/:branchId`. Every write answers with the Customer's detail, Branches included.
- **CORS** runs before the session, so a preflight `OPTIONS` never needs a token, and error responses (401, 403, 400, 404) carry the CORS headers so the dashboard can read `{ error }`. Allowed origins come from **`API_CORS_ORIGINS`** (comma-separated, exact match, default `http://localhost:3010`) in `src/env.ts`; an unlisted origin gets no `Access-Control-Allow-Origin`. Allowed headers: `Authorization`, `Content-Type`, `X-Business-Id`; methods: GET, POST, PUT, PATCH, DELETE. When the dashboard runs on a new origin (a Playwright port, a Vercel domain), add it to the variable. Tests pass origins directly: `setupTestApp({ corsOrigins })`.
- `src/errors.ts`: `ApiError` and the error handler. `src/validator.ts`: `validate(target, schema)`, the `zValidator` wrapper to use for every request schema.
- `src/pg-errors.ts`: `isUniqueViolation(err, constraint)`. Turn a per-business unique constraint into a 409 by catching the write (`.catch(...)`) and checking the constraint name, rather than checking first (two requests can race).
- **Catalog** (`routes/categories.ts`, `routes/products.ts`, services of the same names):
  - `/categories`: list, create, `PATCH /:id` rename. A name that is already taken is 409 `category_name_taken`.
  - `/products`: list (`q` matches name, Code or Brand; `categoryId`; `active=true|false`, both when left out), create, detail, `PATCH /:id`. A Code that is already taken is 409 `product_code_taken`, and a missing or other-tenant Category is 404 `category_not_found`.
  - **No delete:** `PATCH { isActive: false }` makes a Product Inactive, and `true` reactivates it.
  - **Price changes go through `PATCH { price }`:** the Product row is locked `FOR UPDATE`, and when the Price differs, one `product_price_changes` row (old, new, who) is written in the same transaction. Creating a Product writes its first row (`oldPrice: null`). `GET /products/:id/price-history` lists them newest first, with `changedBy: { id, fullName }`. Any other Price write goes through `changePrice(tx, …)` in `services/products.ts`, which sets the Price and writes its history row together (lock the Product first).
  - **Category Price update** (`services/category-price-update.ts`): `POST /categories/:id/price-update/preview` and `POST /categories/:id/price-update`, both with `{ percent }` (`categoryPriceUpdateSchema`: a decimal string, not 0, between -100 and 1000) and both answering `{ category, percent, items: [{ productId, code, name, oldPrice, newPrice }] }` by name. Only Active Products in the Category count. The preview writes nothing; applying locks the Products `FOR UPDATE` in id order and writes the new Prices plus one history row per changed Product in one transaction. A Product whose Price is the same after rounding (e.g. 0.01 at +10%) is listed with `oldPrice === newPrice` and gets no write and no history row. New Prices use `changeByPercent` from `@pollux/contracts` (half-up to cents), so the dashboard can compute the same figures.
- **Stock** (`routes/stock.ts`, `services/stock.ts`):
  - Every Product (list, detail, write responses) carries `stock: { onHand, reserved, available }`. `onHand` is the cached `stock_on_hand`; `reserved` is summed on read from lines of Pending Orders (`reservedStock()` in `services/products.ts`); `available = onHand − reserved`, and may be negative.
  - `POST /stock/adjustments` (`{ productId, quantity, reason, notes? }`, signed non-zero quantity) answers 201 with the Product. `POST /stock/initial-count` (`{ items: [{ productId, quantity ≥ 0 }] }`, no repeats) sets each Product to its count with an `initial_count` adjustment for the difference, skips zero differences, is all-or-nothing (404 `product_not_found` if any Product isn't in the business), and answers `{ items: [{ product, difference }] }` in request order. `GET /stock/movements?productId=` lists a Product's movements newest first with `type`, `quantity`, `reason`, `notes`, `order { id, number }`, `purchase { id, invoiceNumber }` and `createdBy`.
  - **Any stock change goes through `lockProducts(tx, businessId, ids)` then `recordStockMovements(tx, businessId, movements)`** inside the caller's transaction: the first locks the Products `FOR UPDATE` in id order (404 on a missing one) and returns their On-hand stock; the second inserts the movements and moves `stock_on_hand` by the same quantities. Orders (deliver, undo) and Purchases should reuse them.
  - On-hand stock is never blocked from going negative; Orders warn instead of refusing.
- **Orders** (`routes/orders.ts`, `services/orders.ts`; schemas `orderCreateSchema`, `orderUpdateSchema`, `orderListQuerySchema` in `@pollux/contracts`):
  - `POST /orders` (`{ customerId, branchId, deliveryDate, discountPercent?, notes?, lines: [{ productId, quantity, discountPercent? }] }`) creates a Pending Order and answers 201. `GET /orders/:id` is the detail; `PATCH /orders/:id` edits; `POST /orders/:id/cancel` cancels. `GET /orders` lists by `status`, `deliveryDate`, `town` (the Branch's city, case-insensitive) and `customerId`, latest Delivery date first, then by town and number.
  - An Order answers as `{ id, number, status, customer { id, name }, branch { id, name, address, city }, deliveryDate, deliveredOn, discountPercent, notes, deliveryNoteNumber, cancelledAt, createdAt, updatedAt, lines: [{ id, product { id, code, name }, quantity, unitPrice, discountPercent, subtotal }], totals: { subtotal, discountAmount, total } }`, in detail and list alike. Create and edit add `warnings: [{ code: 'stock_negative', lineId, product, available }]`, one per line whose Product is left with negative Available stock; they never block.
  - **Totals are computed on read, never stored**, with `orderTotals`/`lineSubtotal` from `@pollux/contracts` (bigint hundredths, half-up), so the dashboard shows the same figures.
  - **Lines freeze the Product's Price** when added. Editing takes the full line list: a line with `id` is kept (same Product, frozen price; quantity, Discount and position change), a line without one is new and takes the current Price, and lines left out are deleted. A kept line with a different Product is 400 `order_line_product_changed`; an `id` from another Order is 404 `order_line_not_found`. `customerId` on edit is a 400 validation error: cancel and re-create instead.
  - Refusals: a Branch not of the Customer is 400 `branch_not_of_customer`; an Inactive Product on a new line is 409 `product_inactive` (lines already taken for it are kept); editing or cancelling a non-Pending Order is 409 `order_not_pending`.
  - **Locks:** create locks the Products (`lockProducts`) then takes the number; edit and cancel lock the Order row first (`FOR UPDATE`), and edit then locks every Product on the old and new lines. Delivering should follow the same order (Order, then Products).
- **Delivery notes** (`services/delivery-notes.ts`, route on `routes/orders.ts`):
  - `POST /orders/:id/delivery-note` issues the Order's Delivery note, or answers with it again on a reprint (200 both times). The first issue takes the next `delivery_note` number and sets `delivery_note_number` and `delivery_note_issued_at`; later calls return the same number and time. The number then shows on the Order as `deliveryNoteNumber`.
  - It answers with the data to print: `{ number, issuedAt, business { name, cuit }, customer { id, name, legalName, cuit, vatCondition, phone }, branch { id, name, address, city, province, postalCode }, order { id, number, status, deliveryDate, deliveredOn, discountPercent, notes }, lines: [{ product { id, code, name }, quantity, unitPrice, discountPercent, subtotal }], totals }`. Rendering and printing belong to the dashboard.
  - Allowed for Pending and Delivered Orders. A Cancelled Order keeps the number it already has; one without a number is 409 `order_cancelled`. The Order row is locked `FOR UPDATE` before the number is taken, so two issues of one Order at once share a number.
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
- **Order and Delivery note numbers** come from `nextNumber(tx, businessId, kind)` in `services/sequences.ts` (an upsert on `app.business_sequences`: `INSERT ... ON CONFLICT DO UPDATE SET last_value = last_value + 1 RETURNING last_value`, so no rows need creating ahead of time) inside the transaction that needs them. A rolled-back transaction gives its number back.
- **Stock and ledger changes happen in one transaction** with the order, delivery or payment that caused them. Lock the stock rows you change (`SELECT ... FOR UPDATE`) so two orders placed at once can't take the same stock.
- **Every request is tenant-scoped.** Middleware authenticates the user (Supabase Auth JWT), resolves the active `business_id` and checks it against `app.business_members`. That `business_id` goes on the request context, and **every query filters by it**. Never take `business_id` from a request body without checking membership. Tenant isolation lives here, not in RLS (see `db/CLAUDE.md`).
- **The payment method belongs to the delivery or payment, not the customer** (see the root `CLAUDE.md`). Never model customer "types" for cuenta corriente vs. contado.
- **Export the app's type** (`export type AppType = typeof app`) so the dashboard can use it with `hc<AppType>()`. Chain route definitions so the types carry through.
- **Put Zod request schemas that the dashboard also uses** (e.g. order forms) in `@pollux/contracts` (`packages/contracts`), next to the enum values, `cuitSchema` and the money helpers.
- **Lists** validate their query with a schema built on `paginationSchema` from `@pollux/contracts` (`limit` 1–200, default 50; `offset`, default 0) and answer `{ items, total }`, where `total` counts every match. Escape user text before putting it in a `LIKE` pattern.
- **Edits are `PATCH` with partial bodies:** a field left out is kept, `null` clears an optional one. In the shared schemas an empty string in an optional text field means `null`.
- **Errors are `{ error: { code, message, details? } }`**: throw an `ApiError(status, code, message)` with a stable English slug and a Spanish message. Validation errors are 400 `validation_error` with `details` mapping each field path to its messages. Zod's own messages are in Spanish (`z.locales.es()`, set in `src/app.ts`).

## Tests

- **One seam: HTTP through the factory.** Each test file calls `setupTestApp()`, creates its own business with the fixtures, and drives everything else with `request(...)`. Assert on responses and later reads; leave services and tables out of assertions. Only setup data (users, businesses, memberships) is inserted directly.
- **Test names describe business behavior** in `GLOSSARY.md` terms.
- `packages/contracts` has its own unit tests (`pnpm --filter @pollux/contracts test`) for the CUIT and money helpers and the Order totals.

## Hono guidance and tooling

- **Use the `hono` skill** for Hono APIs (routing, middleware, validation, RPC client, testing). For anything beyond it, fetch the current docs from hono.dev as the skill describes, rather than relying on memory.
- **Hono CLI (`@hono/cli`) for quick checks, Vitest for proof.** Use `hono routes`, `hono request` and `hono batch` to inspect routes and try flows in-process while building, instead of throwaway scripts or a running dev server. They don't replace tests: a ticket's behavior is proven by Vitest HTTP tests against the local test Postgres.
- **pnpm, not npm:** it's a dev dependency of this app, run with `pnpm exec hono …`, not with the `npm`/`npx` commands the skill shows. It's pinned to the `1.0.0-rc` line (`@hono/cli@next`), because the stable `0.1.x` has no `routes`, `batch` or `snapshot`. Move to the stable release once 1.0 ships.
- **The CLI needs a default app module.** The app is built by a factory, so the module the CLI loads (default `src/index.ts`) must build a ready app from env: the DB from `.env`, and the real Supabase verifier unless a dev flag selects the test verifier. Point it at the local test DB, not Supabase, when trying writes. Never pass tokens or passwords as CLI arguments; use env vars, as the skill says.
