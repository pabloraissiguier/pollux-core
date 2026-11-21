import { resolve } from 'node:path'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { e2eDatabaseUrl } from './env'

const MIGRATIONS_FOLDER = resolve(import.meta.dirname, '../../../db/migrations')

/**
 * Recreates the E2E database before each run, the way the API suite prepares its own: a stand-in
 * `auth.users` (Supabase owns the real one), then every migration in `db/migrations`.
 */
export default async function globalSetup() {
  const url = e2eDatabaseUrl()
  const name = new URL(url).pathname.slice(1)
  const adminUrl = new URL(url)
  adminUrl.pathname = '/postgres'

  const admin = postgres(adminUrl.toString(), { max: 1, onnotice: () => {} })
  try {
    await admin.unsafe(`drop database if exists "${name}" with (force)`)
    await admin.unsafe(`create database "${name}"`)
  } catch (error) {
    throw new Error(`Can't reach the E2E Postgres at ${adminUrl.host}. Start it with \`docker compose up -d db\`.`, { cause: error })
  } finally {
    await admin.end()
  }

  const client = postgres(url, { max: 1, onnotice: () => {} })
  try {
    await client.unsafe('create schema auth; create table auth.users (id uuid primary key)')
    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER })
  } finally {
    await client.end()
  }
}
