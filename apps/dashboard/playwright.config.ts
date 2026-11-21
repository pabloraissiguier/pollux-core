import { defineConfig, devices } from '@playwright/test'
import { E2E_API_PORT, E2E_DASHBOARD_PORT, e2eDatabaseUrl } from './e2e/env'

const apiUrl = `http://localhost:${E2E_API_PORT}`
const dashboardUrl = `http://localhost:${E2E_DASHBOARD_PORT}`

/**
 * E2E runs on its own ports (API 3101, dashboard 3110) and its own database (`pollux_e2e` on the
 * docker-compose Postgres), so it never collides with `pnpm dev` (3001/3010) or the API suite
 * (`pollux_test`, which that suite drops on every run).
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: dashboardUrl,
    locale: 'es-AR',
    timezoneId: 'America/Argentina/Buenos_Aires',
    trace: 'retain-on-failure'
  },
  projects: [
    // Phone first: every test runs here. Pixel 7 runs on Chromium, so one browser download covers both.
    { name: 'phone', use: { ...devices['Pixel 7'] } },
    // Wide screen only for flows tagged `@desktop` (the shell, the phone-order flow at the PC).
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, grep: /@desktop/ }
  ],
  webServer: [
    {
      command: 'pnpm --dir ../api start',
      url: `${apiUrl}/me`,
      reuseExistingServer: !process.env.CI,
      env: {
        NODE_ENV: 'test',
        API_PORT: String(E2E_API_PORT),
        API_AUTH_VERIFIER: 'test',
        API_CORS_ORIGINS: dashboardUrl,
        DATABASE_URL: e2eDatabaseUrl()
      }
    },
    {
      // A production build in its own dirs (.nuxt-e2e, .output-e2e), so it never clobbers `pnpm dev`.
      command: 'pnpm build && node .output-e2e/server/index.mjs',
      url: dashboardUrl,
      timeout: 240_000,
      reuseExistingServer: !process.env.CI,
      env: {
        POLLUX_E2E: '1',
        PORT: String(E2E_DASHBOARD_PORT),
        NUXT_PUBLIC_API_BASE: apiUrl,
        NUXT_PUBLIC_AUTH_MODE: 'test'
      }
    }
  ]
})
