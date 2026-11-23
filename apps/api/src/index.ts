/**
 * The app built from env. This module is the default entry for:
 * - the Hono CLI (`pnpm exec hono routes`, `hono request /me`), which loads `src/index.ts`;
 * - Vercel, whose Hono support serves the app exported as default from `src/index.ts`;
 * - the Node server (`src/server.ts`).
 */
import { Hono } from 'hono'
import { createApp } from './create-app'
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

/**
 * Served under `/api` everywhere (Node server, CLI, Vercel). On Vercel the project rewrites
 * `/api/(.*)` to this service and passes the path through unchanged, so the prefix lives here.
 * The tests build the app with `createApp` directly, without the prefix.
 */
const app = new Hono().route('/api', createApp({ db, verifyToken, corsOrigins: env.API_CORS_ORIGINS }))

export default app
export type { AppType } from './create-app'
