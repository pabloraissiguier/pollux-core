import * as schema from '@pollux/db/schema'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

export type Database = ReturnType<typeof createDb>['db']

/** The handle inside `db.transaction(async tx => ...)`. */
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]

/** For service helpers that run either on their own or inside a caller's transaction. */
export type DbOrTx = Database | Transaction

export interface DbOptions {
  /** Pool size. Keep it small on serverless. */
  max?: number
  /** Set false for Supabase's transaction pooler (port 6543), which can't use prepared statements. */
  prepare?: boolean
}

/** A Drizzle handle over postgres-js. Local hosts connect without SSL; anything else requires it. */
export function createDb(url: string, options: DbOptions = {}) {
  const isLocal = ['localhost', '127.0.0.1', '::1'].includes(new URL(url).hostname)
  const client = postgres(url, {
    max: options.max ?? 10,
    prepare: options.prepare ?? true,
    ssl: isLocal ? false : 'require',
    onnotice: () => {},
  })
  const db = drizzle(client, { schema })
  return { db, close: () => client.end() }
}
