# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

**pollux-core** is a proof of concept for a management app for small and medium businesses in Argentina (PyMEs). The folder layout and local Postgres are set up, but no app has been scaffolded yet and there is no git repo. When the apps are scaffolded, add their real commands (dev, build, lint, test, running a single test, DB migrations) to the "Commands" section below.

## Repository layout

```
apps/api/         Node API (framework still open): business logic and the only thing that talks to the DB
apps/dashboard/   Nuxt + Nuxt UI frontend; calls apps/api and never touches the DB directly
db/migrations/    SQL schema migrations, applied in order (tool not chosen yet)
db/seeds/         Dev and demo data (e.g. a Gio Pack-like catalog and customers)
docker/           Dockerfiles and local-env support files (e.g. api.Dockerfile, dashboard.Dockerfile)
docs/             Product and architecture docs (domain notes, ADRs)
docker-compose.yml  Local environment. Only `db` (Postgres 17) is active; `api` and `dashboard` are commented placeholders
.env.example      Env vars shared by compose and the apps; copy to `.env`
```

The schema belongs in `db/`, not inside `apps/api`, so it stays independent of the API framework (and of Supabase, if that gets chosen).

## Planned stack (decided)

- **Frontend:** the latest Nuxt, with **Nuxt UI** as the component library. Use Nuxt UI components before writing custom ones.
- **Backend:** a REST/JSON API built on a Node framework (which framework is still open), kept separate from the Nuxt app.
- **Database:** PostgreSQL.

## Still open (don't treat these as decided)

- Whether Postgres is hosted on Supabase or plain Postgres. Keep data access behind a layer that doesn't depend on Supabase-only features (RLS, Supabase Auth, Edge Functions) unless the user chooses Supabase.
- Infrastructure and deployment. Vercel's free tier is being considered for the POC, so avoid designs that need long-running processes, background workers or persistent local disk unless asked.
- Repo layout (monorepo or separate repos) and the Node API framework.

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

Local environment (from the repo root):

```bash
cp .env.example .env                # first time only
docker compose up -d db             # start Postgres on localhost:5432 (user/pass/db: pollux)
docker compose logs -f db
docker compose exec db psql -U pollux -d pollux
docker compose down                 # stop (add -v to wipe the DB volume)
```

App commands: none yet. Add them here once `apps/api` and `apps/dashboard` are scaffolded.
