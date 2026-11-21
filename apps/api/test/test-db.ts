import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseEnv } from 'node:util'

/** Where the suite's database lives: the docker-compose Postgres (port 5433). */
const DEFAULT_TEST_DATABASE_URL = 'postgres://pollux:pollux@localhost:5433/pollux_test'

const ROOT_ENV_FILE = resolve(import.meta.dirname, '../../../.env')

/**
 * The test database URL, from `TEST_DATABASE_URL` (process env first, then the root `.env`),
 * or the docker-compose default. Never reads `DATABASE_URL`, and refuses anything that isn't a
 * local Postgres, so the suite can't touch Supabase.
 */
export function testDatabaseUrl(): string {
  const fromFile = existsSync(ROOT_ENV_FILE) ? parseEnv(readFileSync(ROOT_ENV_FILE, 'utf8')).TEST_DATABASE_URL : undefined
  const url = process.env.TEST_DATABASE_URL || fromFile || DEFAULT_TEST_DATABASE_URL
  const { hostname, pathname } = new URL(url)
  if (!['localhost', '127.0.0.1', '::1'].includes(hostname)) {
    throw new Error(`TEST_DATABASE_URL must point at a local Postgres, got host "${hostname}"`)
  }
  if (!/test/.test(pathname)) {
    throw new Error(`TEST_DATABASE_URL must name a test database (its name must contain "test"), got "${pathname.slice(1)}"`)
  }
  return url
}
