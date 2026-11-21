/**
 * The app built from env. This module is the default entry for:
 * - the Hono CLI (`pnpm exec hono routes`, `hono request /me`), which loads `src/index.ts`;
 * - Vercel, whose Hono support serves the app exported as default from `src/index.ts`;
 * - the Node server (`src/server.ts`).
 */
import { createApp } from './app'
import { createSupabaseVerifier, createTestVerifier } from './auth/verifier'
import { createDb } from './db'
import { readEnv } from './env'

const env = readEnv()

// Serverless functions go through the transaction pooler, which can't use prepared statements.
const { db } = env.VERCEL
  ? createDb(env.DATABASE_POOLER_URL ?? env.DATABASE_URL, { max: 1, prepare: false })
  : createDb(env.DATABASE_URL)

const verifyToken = env.API_AUTH_VERIFIER === 'test'
  ? createTestVerifier()
  : createSupabaseVerifier(env.SUPABASE_URL)

const app = createApp({ db, verifyToken })

export default app
export type { AppType } from './app'
