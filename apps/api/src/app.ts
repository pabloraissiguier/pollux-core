import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { z } from 'zod'
import { session } from './auth/session'
import type { AuthVerifier } from './auth/verifier'
import type { AppEnv } from './context'
import type { Database } from './db'
import { handleError, handleNotFound } from './errors'
import { meRoutes } from './routes/me'

// Zod's built-in validation messages in Spanish.
z.config(z.locales.es())

export interface AppDeps {
  db: Database
  verifyToken: AuthVerifier
  /** Browser origins allowed to call the API (the dashboard's), matched exactly. */
  corsOrigins: string[]
}

/**
 * Builds the app from its dependencies. The Node server, the Vercel entry, the Hono CLI and the
 * tests all go through here; only the dependencies differ.
 */
export function createApp({ db, verifyToken, corsOrigins }: AppDeps) {
  if (verifyToken.kind === 'test' && process.env.NODE_ENV === 'production') {
    throw new Error('The test auth verifier cannot be used in production')
  }

  const app = new Hono<AppEnv>()
    // Before the session, so a preflight `OPTIONS` never needs a token. Error responses keep
    // these headers, so the dashboard can read `{ error }` on a 401 or 403.
    .use(cors({
      origin: corsOrigins,
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowHeaders: ['Authorization', 'Content-Type', 'X-Business-Id'],
      maxAge: 600,
    }))
    .use(async (c, next) => {
      c.set('db', db)
      await next()
    })
    .use(session(verifyToken))
    .route('/me', meRoutes)

  app.onError(handleError)
  app.notFound(handleNotFound)
  return app
}

/** The API's route types, for the dashboard's `hc<AppType>()` client. */
export type AppType = ReturnType<typeof createApp>
