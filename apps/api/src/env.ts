import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { z } from 'zod'

/**
 * The shared `.env` at the workspace root, found by walking up from the working directory.
 * (Not from this file's path: the Hono CLI bundles this module before running it.)
 */
function findRootEnvFile(): string | null {
  for (let dir = process.cwd(); ; dir = dirname(dir)) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) {
      const file = join(dir, '.env')
      return existsSync(file) ? file : null
    }
    if (dirname(dir) === dir) return null
  }
}

// Local runs read the shared root .env. Variables already set (shell, Vercel) win over the file.
const rootEnvFile = findRootEnvFile()
if (rootEnvFile) process.loadEnvFile(rootEnvFile)

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  /** Session pooler (5432), for every runtime: the Node server, the CLI and Vercel. */
  DATABASE_URL: z.url(),
  SUPABASE_URL: z.url(),
  API_PORT: z.coerce.number().int().positive().default(3001),
  /**
   * Dev flag: `test` makes the bearer token just a user id, for trying the app with the Hono CLI
   * against the local test DB. Refused in production by the app factory.
   */
  API_AUTH_VERIFIER: z.enum(['supabase', 'test']).default('supabase'),
  /**
   * Browser origins allowed to call the API, comma-separated (the dashboard's: dev, Playwright,
   * Vercel). An origin not listed gets no CORS headers.
   */
  API_CORS_ORIGINS: z.string().default('http://localhost:3010').transform(value =>
    value.split(',').map(origin => origin.trim()).filter(Boolean)),
  /** Set by Vercel on its functions. */
  VERCEL: z.string().optional(),
})

export type Env = z.infer<typeof schema>

export function readEnv(): Env {
  const result = schema.safeParse(process.env)
  if (!result.success) {
    throw new Error(`Invalid API environment:\n${z.prettifyError(result.error)}`)
  }
  return result.data
}
