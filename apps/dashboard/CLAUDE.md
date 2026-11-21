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
```

There is no test runner yet.

## Structure and conventions

- **App shell:** `app/layouts/default.vue` wraps every page in `UDashboardGroup` with a collapsible `UDashboardSidebar` and `UNavigationMenu`. **Each page renders one `UDashboardPanel`** with a `UDashboardNavbar` in `#header` and its content in `#body`. To add a section, create the page and add it to the `links` array in the layout.
- **Routes and UI text are in Spanish** (`/pedidos`, `/clientes`, `/cuentas-corrientes`, `/productos`). `app.vue` passes Nuxt UI's `es` locale to `<UApp>` and sets `lang="es-AR"`. Page titles are set with `useSeoMeta({ title })` and the template appends `· Pollux`.
- `SectionPlaceholder.vue` is a temporary empty-state body for sections that aren't built yet. Replace it with real content; don't build on top of it.
- **Theme:** `app.config.ts` sets `primary: green` and `neutral: slate`, and `assets/css/main.css` overrides the green scale. The Nuxt UI ESLint rules block raw Tailwind palette colors (`no-palette-colors`), so use semantic tokens (`text-primary`, `text-muted`, `bg-elevated`, `border-default`, …) instead of `text-green-500`.
- **Nuxt UI first.** Build screens from Nuxt UI components (forms, tables, menus, overlays, steppers, dashboard parts, …) and their props, slots and variants. Before writing a custom component, look for one in Nuxt UI (Nuxt UI MCP or `nuxt-ui` skill). Write a custom component only when nothing fits, and compose it from Nuxt UI parts.
- **Minimal CSS, customized globally.** Write as little CSS as possible. Change the look at the app level: theme colors and component defaults or slot classes in `app.config.ts` (`ui: { button: { … } }`), and design tokens in `assets/css/main.css` (`@theme` and CSS variables). Don't restyle individual component instances with long `class` or `:ui` overrides or scoped `<style>` blocks. Use Tailwind utility classes for layout (flex, grid, spacing). Override a single instance only when a screen truly needs something different from the rest of the app.
- **ESLint style:** no trailing commas, 1TBS braces. `pnpm lint --fix` handles most of it.
- **Mobile-first:** the sidebar turns into a drawer on small screens (`v-model:open`). Check every new screen at phone width, since order entry and payments happen on the road.

## Data access

The dashboard **only talks to `apps/api`**. Don't add Nuxt server routes holding business logic, and don't query Postgres or Supabase tables from here. The plan is to consume the API through Hono's typed RPC client (`hc<AppType>`, see `apps/api/CLAUDE.md`) once the API exists. Supabase Auth on the client side (session handling) may be added later; that's the only expected exception.
