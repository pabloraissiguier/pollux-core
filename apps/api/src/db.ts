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
}

/**
 * A Drizzle handle over postgres-js. Local hosts connect without SSL; anything else requires it.
 * The timeouts make a lost connection fail fast instead of hanging requests: a connection that
 * can't be opened in 10s errors, an idle one closes after 20s (serverless instances get frozen
 * between requests, which can leave a dead socket behind), and none lives past 30 minutes.
 */
export function createDb(url: string, options: DbOptions = {}) {
  const isLocal = ['localhost', '127.0.0.1', '::1'].includes(new URL(url).hostname)
  const client = postgres(url, {
    max: options.max ?? 10,
    connect_timeout: 10,
    idle_timeout: 20,
    max_lifetime: 60 * 30,
    ssl: isLocal ? false : 'require',
    onnotice: () => {},
  })
  const db = drizzle(client, { schema })
  return { db, close: () => client.end() }
}
