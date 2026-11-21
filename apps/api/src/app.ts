import { Hono } from 'hono'
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
}

/**
 * Builds the app from its dependencies. The Node server, the Vercel entry, the Hono CLI and the
 * tests all go through here; only the dependencies differ.
 */
export function createApp({ db, verifyToken }: AppDeps) {
  if (verifyToken.kind === 'test' && process.env.NODE_ENV === 'production') {
    throw new Error('The test auth verifier cannot be used in production')
  }

  const app = new Hono<AppEnv>()
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
