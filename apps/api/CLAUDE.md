# CLAUDE.md: apps/api

This file covers the API app only. Product context, the domain and the repo layout are in the root `CLAUDE.md`.

## Status

The stack is decided, but the app has **not been scaffolded yet**. Once it is, add the real commands (dev, build, lint, test, running a single test, generating and applying migrations).

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

- **The schema and migrations live in the repo-level `db/`, not in this app.** Point drizzle-kit's `out` at `../../db/migrations`. The schema stays independent of the framework.
- **Money is `numeric(14,2)`**: never JS floats or `real`/`double` columns. Handle amounts as strings or decimals in code, not as `number`.
- **A customer's balance is calculated from their ledger entries**, not stored as a column that gets edited in place.
- **Stock and ledger changes happen in one transaction** with the order, delivery or payment that caused them. Lock the stock rows you change (`SELECT ... FOR UPDATE`) so two orders placed at once can't take the same stock.
- **Every request is tenant-scoped.** Middleware authenticates the user (Supabase Auth JWT), resolves the active `business_id` and checks it against `app.business_members`. That `business_id` goes on the request context, and **every query filters by it**. Never take `business_id` from a request body without checking membership. Tenant isolation lives here, not in RLS (see `db/CLAUDE.md`).
- **The payment method belongs to the delivery or payment, not the customer** (see the root `CLAUDE.md`). Never model customer "types" for cuenta corriente vs. contado.
- **Export the app's type** (`export type AppType = typeof app`) so the dashboard can use it with `hc<AppType>()`. Chain route definitions so the types carry through.
- **Put Zod request schemas that the dashboard also uses** (e.g. order forms) in a shared workspace package rather than duplicating them.
