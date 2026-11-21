# CLAUDE.md: db

This file covers the database schema and migrations. Product context and the domain are in the root `CLAUDE.md`. The API's data-access rules (money types, transactions, ledger) are in `apps/api/CLAUDE.md`.

## Hosting

- **The dev database is a remote Supabase project**, and that stays true for all of app development. There is **no local database**: the `db` service in `docker-compose.yml` isn't used for now.
- **Self-hosted Postgres is a possible future move, not a current task.** Keep the schema portable (see the rules below) so that move would be a data migration, not a rewrite.
- **Connection strings live in `.env` (gitignored).** Use the Supabase **session pooler** (port 5432) for migrations and long-lived connections, and the **transaction pooler** (port 6543, with prepared statements disabled, `prepare: false`) for serverless runtimes.

## Multi-tenancy

The app is **multi-tenant from day one**: many businesses (PyMEs) share one database, and Gio Pack is the first tenant.

- **`app.businesses` is the tenant table.** `app.business_members (business_id, profile_id, role)` links users to businesses. One user can belong to several businesses.
- **Every business table has `business_id uuid not null`** referencing `app.businesses`. Uniqueness is per tenant, e.g. `unique (business_id, sku)`, not a global `unique (sku)`.
- **References between business tables include `business_id`** (composite FK `(business_id, x_id)` → `(business_id, id)`, which needs a `unique (business_id, id)` on the parent), so a row can never point at another tenant's data.
- **Index every business table on `business_id`**, either alone or as the leading column of a composite index.
- **Tenant isolation is enforced in the API:** every query is scoped by the current `business_id`, resolved from the user's membership. See `apps/api/CLAUDE.md`.

## Schema layout

| Schema | Owner | Contents |
|---|---|---|
| `auth` | Supabase | User accounts and sessions (`auth.users`). **We never create or alter tables here.** |
| `public` | us | Only `public.profiles`, the app's user profile (1:1 with `auth.users`). No business tables. |
| `app` | us | Tenancy (`businesses`, `business_members`) and **all business tables**: customers, products, stock, orders, deliveries, remitos, ledger entries, payments, purchases, … |

The `app` schema name is provisional. Rename it before the first migration if a better name comes up.

### Rules that keep it portable
- **`public.profiles` is the only table that references `auth.users`** (`id uuid primary key references auth.users(id) on delete cascade`). Business tables reference `public.profiles(id)` (e.g. `created_by`), **never `auth.users` directly**. If we replace Supabase Auth, only `profiles` and its FK change.
- **Authorization and tenant isolation are enforced in the API, not in RLS policies.** Don't depend on `auth.uid()`, `auth.jwt()` or Supabase roles (`anon`, `authenticated`) in business logic.
- **Enable RLS with no policies on every table we create** (`ENABLE ROW LEVEL SECURITY`). On Supabase this blocks the auto-generated REST API (PostgREST) from exposing the tables; on plain Postgres it's harmless. The API connects as a role that bypasses RLS.
- **Use only standard Postgres features:** no Supabase-only extensions, Edge Functions, or triggers into Supabase internals. `gen_random_uuid()` is fine.
- **Primary keys are `uuid` with `gen_random_uuid()`.**
- If we ever move off Supabase, plain Postgres will need a minimal stand-in `auth.users` table (`id uuid primary key`) so the same migrations run. Don't build it until that move happens.

## Migrations

- **Drizzle (in `apps/api`) is the source of truth.** `drizzle-kit` writes plain SQL into `db/migrations/`, and those files are applied to the Supabase project with `drizzle-kit migrate`.
- **Don't change the schema any other way:** not through the Supabase dashboard, and not with the Supabase MCP `apply_migration` or DDL through `execute_sql`. Either one causes drift from `db/migrations/`. The Supabase MCP is fine for **read-only** work: `list_tables`, `SELECT` queries, logs, advisors.
- **It's a shared remote database, so migrations are hard to reverse.** Review the generated SQL before applying it, and never run destructive SQL (`DROP`, `TRUNCATE`, mass `DELETE`) without asking.
- `db/seeds/` holds demo data (a Gio Pack-like business with its catalog, customers and towns). Seeds must be idempotent and scoped to a specific `business_id`.
