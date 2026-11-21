# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

**pollux-core** is a proof of concept for a management app for small and medium businesses in Argentina (PyMEs). The dashboard is scaffolded (an app shell with placeholder sections). The API and the DB schema are not written yet.

Each part has its own `CLAUDE.md` with its stack, commands and conventions: `apps/api/`, `apps/dashboard/`, `db/`. Keep details there; this file covers only what applies across the whole repo.

## Repository layout

This is a **pnpm workspace** (`pnpm-workspace.yaml`: `apps/*`, `packages/*`). pnpm build-script approvals (`allowBuilds`) live in the root `pnpm-workspace.yaml`, not in the individual apps.

```
apps/api/         Node API: business logic and the only thing that talks to the DB (not scaffolded yet)
apps/dashboard/   Nuxt 4 + Nuxt UI v4 frontend; calls apps/api and never touches the DB directly
packages/         Shared workspace packages, e.g. Zod schemas used by both apps (none yet)
db/migrations/    SQL schema migrations, applied in order
db/seeds/         Dev and demo data (e.g. a Gio Pack-like catalog and customers)
docker/           Dockerfiles and local-env support files (e.g. api.Dockerfile, dashboard.Dockerfile)
docs/             Product and architecture docs (domain notes, ADRs)
docker-compose.yml  Local environment. Only `db` (Postgres 17) is active; `api` and `dashboard` are commented placeholders
.env.example      Env vars shared by compose and the apps; copy to `.env`
```

The schema belongs in `db/`, not inside `apps/api`, so it stays independent of the API framework and of the DB host.

## Stack (decided)

- **Frontend:** Nuxt 4 with **Nuxt UI v4**. Use Nuxt UI components before writing custom ones. See `apps/dashboard/CLAUDE.md`.
- **Backend:** a separate Node API. See `apps/api/CLAUDE.md`.
- **Database:** a **remote Supabase project** (Postgres 17 plus Supabase Auth), used for all of development; there is no local DB. **Multi-tenant**: many businesses share the database, and Gio Pack is the first. The schema must stay portable to self-hosted Postgres. See `db/CLAUDE.md`.

## Still open (don't treat these as decided)

- A possible move to self-hosted Postgres, and whether Supabase Auth stays. Neither is planned yet.
- Infrastructure and deployment. Vercel's free tier is being considered for the POC, so avoid designs that need long-running processes, background workers or persistent local disk unless asked.

## Domain context

The reference customer is **Gio Pack**, a distributor in Corral de Bustos, Córdoba. Users and data are in Spanish (es-AR), so the UI must be in Spanish. Use Argentine conventions: ARS currency, `dd/mm/yyyy` dates, CUIT for tax IDs.

### How the business works
- **Route-based selling:** each day the owner visits a different town to take orders (preventa). The next day they go back to deliver (reparto). So orders are tied to a town or route and a delivery date.
- Some orders come in **by phone**, and these must go through the same order flow.
- **One price list for everyone.** Large orders sometimes get a discount, so discounts apply to the **order** (or its line items), not to the customer.

### What the current system does and why it fails
Their current desktop-only system is used only for stock, purchase invoices, price updates and **remitos** (delivery notes). Everything else lives in Excel. Their main complaint:

> The system makes me register each customer differently depending on whether they're on cuenta corriente or pay cash. I never know how they'll pay until I drop off the order.

**Core design rule:** the **payment method is decided per delivery or payment, not per customer.** There is one customer entity. Any customer can pay cash on one delivery and put the next one on account. A customer may have a *default* payment method or credit flag, but it must never split customers into different types or tables.

### Features in scope
1. **Order entry** (in the field and by phone) that **updates stock automatically** (reserve or decrement).
2. **Remitos** generated from orders or deliveries (the one thing the current system does well).
3. **Customer ledger** (debe/haber, cuenta corriente): sales add debits, payments add credits, the balance is derived. This replaces the Excel sheet.
4. **Mixed payment handling:** cash, account, or other methods, chosen when the order is delivered or paid.
5. **Digital product catalog.**
6. Products, stock, purchases (boletas de compra) and price updates, at parity with the current system.

Invoicing (facturación) is done today through the **ARCA** portal (formerly AFIP) and is **out of scope for now**. Don't build ARCA/AFIP integration unless asked, but keep the sales model compatible with adding electronic invoices later.

### UX constraints
- The current tool is "only usable from the PC," which is a main pain point. **Mobile-first:** order entry and payment recording must work well on a phone, on the road.
- The user dropped the old system because it was cumbersome. Keep common flows (take an order, record a payment, check a customer's balance) to as few steps as possible.

## Commands

pnpm is pinned through `packageManager` in the root `package.json`. Run `corepack enable` once (or call `corepack pnpm …`).

```bash
pnpm install                        # from the root, installs every workspace
pnpm dev:dashboard                  # Nuxt dev server on http://localhost:3010
pnpm build:dashboard
pnpm --filter dashboard lint        # or typecheck; see apps/dashboard/CLAUDE.md
```

Copy `.env.example` to `.env` and fill in the Supabase values. The DB is remote, so there's nothing to start locally.

`docker-compose.yml` only has a local Postgres (port 5433), kept for a possible future self-hosted setup; it isn't part of the current workflow. The dashboard uses port 3010 because 3000 is taken by other local projects.
