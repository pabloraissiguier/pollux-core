# CLAUDE.md: apps/dashboard

This file covers the dashboard app only. Product context and the domain are in the root `CLAUDE.md`.

## Stack

- **Nuxt 4** (source lives in `app/`, Nuxt 4 layout), **Nuxt UI v4**, Tailwind CSS v4, TypeScript.
- Icons: Iconify **lucide** (`i-lucide-*`) and **simple-icons**, both installed locally.
- Scaffolded from the official `ui` starter template, with its marketing content removed.

## Commands

Run from `apps/dashboard/`, or from the root with `pnpm --filter dashboard <script>`:

```bash
pnpm dev          # http://localhost:3010 (3000 is used by other local projects)
pnpm build        # production build in .output/
pnpm preview
pnpm lint         # ESLint (add --fix)
pnpm typecheck    # vue-tsc through nuxt typecheck
pnpm test:e2e     # Playwright; needs `docker compose up -d db` (root). Builds and starts its own servers
pnpm test:e2e e2e/sign-in.spec.ts             # one file
pnpm test:e2e --project phone -g "signs in"   # one project, tests whose name matches
pnpm test:unit    # Vitest, for pure modules (app/utils/format.ts)
```

First run on a machine: `pnpm exec playwright install chromium` (both projects use Chromium).

### Environment

`nuxt.config.ts` loads the root `.env`. Public runtime config, overridable at run time with `NUXT_PUBLIC_*`:

| Key | Env at run time | Default |
|---|---|---|
| `apiBase` | `NUXT_PUBLIC_API_BASE` | `http://localhost:${API_PORT}` (3001) |
| `supabaseUrl`, `supabasePublishableKey` | `NUXT_PUBLIC_SUPABASE_URL`, `NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` from `.env` at build time |
| `authMode` | `NUXT_PUBLIC_AUTH_MODE` | `supabase`. `test` is for E2E only (see below) |

The app is a client-side SPA (`ssr: false`): everything is behind sign-in and all data comes from the API with a bearer token held in the browser.

## Tests

- **Seam: the running app, end to end.** Playwright (`playwright.config.ts`, tests in `e2e/`) starts the API (`API_AUTH_VERIFIER=test`) on **3101** and a production build of the dashboard (`NUXT_PUBLIC_AUTH_MODE=test`) on **3110**, never the dev ports 3001/3010. The build goes to `.nuxt-e2e`/`.output-e2e` (`POLLUX_E2E=1`), so it never clobbers `pnpm dev`. Locally, servers already running on those ports are reused.
- **Its own database:** global setup drops and recreates **`pollux_e2e`** on the docker-compose Postgres (`E2E_DATABASE_URL` to override; it must be local and its name must contain `e2e`), then applies `db/migrations`. Never `pollux_test`: the API suite drops that one on every run.
- **Projects:** `phone` (Pixel 7, the default way the app is used) runs every test; `desktop` runs only tests tagged `{ tag: '@desktop' }` (flows that must also work at the PC, like the phone-order flow). Use the `openSidebar` fixture, since on a phone the sidebar is a drawer.
- **Test sign-in mode:** with `NUXT_PUBLIC_AUTH_MODE=test` the dashboard skips Supabase and the **password is the bearer token**, which the API's test verifier reads as a user id (the API refuses that verifier in production). The login page shows a "Modo de prueba" notice.
- **Fixtures** (`e2e/fixtures.ts`): `createOwner(...businessNames)` inserts a user and their businesses straight into the DB (no onboarding endpoint exists); `signIn(userId)` goes through `/login`; `createCustomer(userId, input)` posts a Customer to the API in the user's first business, for tests that only need one as a starting point. Everything else goes through the UI. Each test makes its own user and businesses, so tests run in parallel.
- Locate by role, label and Spanish text, never CSS classes. Toast titles also appear in a hidden live region, so match them with `{ exact: true }`. `UTable` adds an empty decoration row to its header, so count data rows with `getByRole('row').filter({ has: page.getByRole('cell') })`.
- `test/` holds Vitest unit tests for pure modules only; it runs in a far-west time zone so a date that drifts through UTC fails.

## Structure and conventions

- **App shell:** `app/layouts/default.vue` wraps every page in `UDashboardGroup` with a collapsible `UDashboardSidebar` and `UNavigationMenu`. **Each page renders one `UDashboardPanel`** with a `UDashboardNavbar` in `#header` and its content in `#body`. To add a section, create the page and add it to the `links` array in the layout.
- **Routes and UI text are in Spanish** (`/pedidos`, `/clientes`, `/cuentas-corrientes`, `/productos`). `app.vue` passes Nuxt UI's `es` locale to `<UApp>` and sets `lang="es-AR"`. Page titles are set with `useSeoMeta({ title })` and the template appends `· Pollux`.
- **Auth and business:** `useAuth()` (Supabase session or test mode, restored by `plugins/auth.ts`), `middleware/auth.global.ts` (signed-out users go to `/login?redirect=<path>`; the first navigation loads the user's businesses from `GET /me` and sends users with several and no choice on this device to `/negocio`), `useActiveBusiness()` (the business list and the active one, remembered per device and per user in `localStorage`; `GET /me` is sent without `X-Business-Id`, so a stale choice just means picking again), `useSignOut()` (`endSession()` is the one sign-out sequence, also used on a 401). `/login` and `/negocio` use no layout. The sidebar shows `BusinessSwitcher` only for users with several businesses.
- **Formatting** (`app/utils/format.ts`, auto-imported): `formatMoney("12345.50")` → `$ 12.345,50` (the decimal string goes straight to `Intl`, never through a float), `formatDate` (`yyyy-mm-dd` → `dd/mm/yyyy` as text, timestamps in Argentina time), `maskCuit` while typing, and `<enum>Labels` with the Spanish name of every enum value. Show values only through these.
- **Clientes** (`pages/clientes/`): list with search and town filter kept in the URL (`?q=`, `?localidad=`, `?pagina=`), `nuevo` (name plus one Branch), and `[id]` (details, Branches, tap-to-call, and a reserved Balance area). `utils/customers.ts` holds the `Customer`/`Branch` types (inferred from the API) and the form states; `components/customer/` holds the shared fields and the edit modals (`CustomerEditModal`, `CustomerBranchFormModal`). Forms validate with the `@pollux/contracts` schemas the API uses.
- `SectionPlaceholder.vue` is a temporary empty-state body for sections that aren't built yet. Replace it with real content; don't build on top of it.
- **Theme:** `app.config.ts` sets `primary: green` and `neutral: slate`, and `assets/css/main.css` overrides the green scale. The Nuxt UI ESLint rules block raw Tailwind palette colors (`no-palette-colors`), so use semantic tokens (`text-primary`, `text-muted`, `bg-elevated`, `border-default`, …) instead of `text-green-500`.
- **Productos** (`pages/productos/`): the catalog (search, Category filter and "Mostrar inactivos" kept in the URL as `?q=`, `?categoria=`, `?inactivos=1`, `?pagina=`; Active only by default), `nuevo`, `[id]` (details, Active switch, "Cambiar precio", price history), `categorias` (create and rename; each Category opens the catalog filtered by it) and `actualizar-precios` (the Category Price update, reached from `categorias` with `?categoria=`: pick "Aumento" or "Rebaja" and a percent without a sign, preview old vs. new Prices, then apply exactly what was previewed; editing the form after the preview discards it). The edit form leaves the Price out: a Price changes only through "Cambiar precio", so every change is a deliberate entry in the history. `utils/products.ts` holds the `Product`/`Category`/`PriceChange` types and the form schemas, built on the `@pollux/contracts` ones but accepting a Price typed the es-AR way (`1.234,50`, read by `parseDecimalInput` in `utils/format.ts`). The Category picker offers "Sin categoría" as an item whose value is `null`, which the API reads as "clear it" (a missing field would mean "no change"). `useCategories()` shares the Category list under the `categorias` key. `formatPercent("10.50")` → `10,5 %` shows VAT rates.
- **Nuxt UI first.** Build screens from Nuxt UI components (forms, tables, menus, overlays, steppers, dashboard parts, …) and their props, slots and variants. Before writing a custom component, look for one in Nuxt UI (Nuxt UI MCP or `nuxt-ui` skill). Write a custom component only when nothing fits, and compose it from Nuxt UI parts.
- **Lists:** `UPageList divide` draws each divider with an absolute `::after`, so its children need `relative` (`UPageCard` has it; a plain `ULink` row doesn't). For a tappable row, use a `ULink` holding the visible text: a `UPageCard` link is an empty overlay that Playwright sees as hidden.
- **Minimal CSS, customized globally.** Write as little CSS as possible. Change the look at the app level: theme colors and component defaults or slot classes in `app.config.ts` (`ui: { button: { … } }`), and design tokens in `assets/css/main.css` (`@theme` and CSS variables). Don't restyle individual component instances with long `class` or `:ui` overrides or scoped `<style>` blocks. Use Tailwind utility classes for layout (flex, grid, spacing). Override a single instance only when a screen truly needs something different from the rest of the app.
- **Where to look, in order:** (1) Nuxt UI (the `nuxt-ui` skill and the Nuxt UI MCP) for components, theming and app config; (2) Nuxt (the Nuxt MCP) for routing, data fetching, middleware and config; (3) the `modern-web-guidance` skill for web-platform practice that neither covers: accessibility, forms and autofill, dates and timezones, print CSS, performance (LCP, INP, CLS), security and client-side JS APIs. Modern Web Guidance never overrides "Nuxt UI first": use it to get the platform details right inside or around Nuxt UI components, not to hand-roll a component Nuxt UI already provides.
- **ESLint style:** no trailing commas, 1TBS braces. `pnpm lint --fix` handles most of it.
- **Mobile-first:** the sidebar turns into a drawer on small screens (`v-model:open`). Check every new screen at phone width, since order entry and payments happen on the road.

## Data access

The dashboard **only talks to `apps/api`**. Don't add Nuxt server routes holding business logic, and don't query Postgres or Supabase tables from here. Supabase Auth on the client (sign-in and session, in `useAuth`) is the one exception.

- **`useApi()`** wraps Hono's typed client (`hc<AppType>`, typed from `api/src/app` through a type-only workspace dev dependency) and adds the bearer token and `X-Business-Id` to every request. Call it in setup, then `const data = await request(c => c.me.$get())`: it returns the typed body of the success response, or handles the error and throws `ApiRequestError`. To name a response type, use `InferResponseType<ApiClient['customers'][':id']['$get'], 200>` (`ApiClient` is exported from `useApi.ts`).
- **Errors** arrive as `{ error: { code, message, details? } }` with a Spanish message. `request` maps them: 401 signs out and goes to `/login` (coming back afterwards); 403 and 400 `business_not_selected` go to the business picker; 400 `validation_error` puts `details` on a form's fields when you pass `{ form }` (a `UForm` ref); anything else becomes a toast. Callers only catch `ApiRequestError` to stop their own flow.
- Route middleware passes `{ navigate: false, returnTo: to.fullPath }` and returns `navigateTo(error.redirectTo)` itself, since it can't start a second navigation and the current page isn't the one being entered.
