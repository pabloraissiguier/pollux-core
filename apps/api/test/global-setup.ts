import { resolve } from 'node:path'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { testDatabaseUrl } from './test-db'

const MIGRATIONS_FOLDER = resolve(import.meta.dirname, '../../../db/migrations')

/**
 * Runs once before the suite: recreates the test database on the docker-compose Postgres,
 * adds a stand-in `auth.users` (Supabase owns the real one), and applies `db/migrations`.
 * Applying the real migrations to plain Postgres also proves the schema stays portable.
 */
export async function setup() {
  const url = testDatabaseUrl()
  const name = new URL(url).pathname.slice(1)
  const adminUrl = new URL(url)
  adminUrl.pathname = '/postgres'

  const admin = postgres(adminUrl.toString(), { max: 1, onnotice: () => {} })
  try {
    await admin.unsafe(`drop database if exists "${name}" with (force)`)
    await admin.unsafe(`create database "${name}"`)
  }
  catch (error) {
    throw new Error(`Can't reach the test Postgres at ${adminUrl.host}. Start it with \`docker compose up -d db\`.`, { cause: error })
  }
  finally {
    await admin.end()
  }

  const client = postgres(url, { max: 1, onnotice: () => {} })
  try {
    await client.unsafe('create schema auth; create table auth.users (id uuid primary key)')
    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER })
  }
  finally {
    await client.end()
  }
}
