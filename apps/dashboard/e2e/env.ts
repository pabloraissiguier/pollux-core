export const E2E_API_PORT = 3101
export const E2E_DASHBOARD_PORT = 3110

const DEFAULT_E2E_DATABASE_URL = 'postgres://pollux:pollux@localhost:5433/pollux_e2e'

/**
 * The E2E database: `E2E_DATABASE_URL`, or `pollux_e2e` on the docker-compose Postgres. Never the
 * API suite's `pollux_test` (that suite drops it on every run) and never a remote host, because
 * global setup drops and recreates it.
 */
export function e2eDatabaseUrl(): string {
  const url = process.env.E2E_DATABASE_URL || DEFAULT_E2E_DATABASE_URL
  const { hostname, pathname } = new URL(url)
  if (!['localhost', '127.0.0.1', '::1'].includes(hostname)) {
    throw new Error(`E2E_DATABASE_URL must point at a local Postgres, got host "${hostname}"`)
  }
  if (!pathname.includes('e2e')) {
    throw new Error(`E2E_DATABASE_URL must name an E2E database (its name must contain "e2e"), got "${pathname.slice(1)}"`)
  }
  return url
}
