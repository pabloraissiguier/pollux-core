import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/app'
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

    expect(() => createApp({ db, verifyToken: createTestVerifier() })).toThrow(/production/)
    expect(() => createApp({ db, verifyToken: createSupabaseVerifier('https://example.supabase.co') })).not.toThrow()
    await close()
  })
})
