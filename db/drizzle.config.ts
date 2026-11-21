import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'drizzle-kit'

// Commands run from db/; the shared .env lives at the repo root.
const envFile = resolve(process.cwd(), '../.env')
if (existsSync(envFile)) process.loadEnvFile(envFile)

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
  // Only our schemas. `auth` belongs to Supabase and is never managed from here.
  schemaFilter: ['public', 'app'],
  dbCredentials: {
    // Session pooler (port 5432). See db/CLAUDE.md.
    url: process.env.DATABASE_URL ?? '',
  },
  strict: true,
  verbose: true,
})
