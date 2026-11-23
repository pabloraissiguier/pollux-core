import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/create-app'
import { createSupabaseVerifier, createTestVerifier } from '../src/auth/verifier'
import { createDb } from '../src/db'
import { testDatabaseUrl } from './test-db'

describe('app factory', () => {
  const { db, close } = createDb(testDatabaseUrl(), { max: 1 })

  afterEach(async () => {
    vi.unstubAllEnvs()
  })

  it('refuses the test verifier in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')

    expect(() => createApp({ db, verifyToken: createTestVerifier(), corsOrigins: [] })).toThrow(/production/)
    expect(() => createApp({ db, verifyToken: createSupabaseVerifier('https://example.supabase.co'), corsOrigins: [] })).not.toThrow()
    await close()
  })
})
