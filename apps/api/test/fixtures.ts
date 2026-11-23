import { randomUUID } from 'node:crypto'
import { businesses, businessMembers, profiles } from '@pollux/db/schema'
import { sql } from 'drizzle-orm'
import { createApp } from '../src/create-app'
import { createTestVerifier } from '../src/auth/verifier'
import { createDb } from '../src/db'
import { testDatabaseUrl } from './test-db'

type BusinessDetails = Omit<Partial<typeof businesses.$inferInsert>, 'id' | 'name' | 'createdAt' | 'updatedAt'>

/**
 * Builds the app the way production does (through the factory), wired to the local test
 * database and the test verifier, where a bearer token is just the user's id.
 *
 * Only setup data bypasses HTTP: there's no onboarding endpoint, so users, businesses and
 * memberships are inserted directly. Each test file creates its own business, so files can run
 * in parallel without cleaning up between tests.
 */
export function setupTestApp({ corsOrigins = ['http://localhost:3010'] }: { corsOrigins?: string[] } = {}) {
  const { db, close } = createDb(testDatabaseUrl(), { max: 5 })
  const app = createApp({ db, verifyToken: createTestVerifier(), corsOrigins })

  /** A signed-up user: a row in the stand-in `auth.users`, with no profile yet. */
  async function createUser(): Promise<string> {
    const id = randomUUID()
    await db.execute(sql`insert into auth.users (id) values (${id})`)
    return id
  }

  /**
   * A business with the given users as owners. `details` sets the business's own data (address,
   * VAT condition, ...) without going through `PATCH /business`.
   */
  async function createBusiness(name: string, ownerIds: string[], details: BusinessDetails = {}): Promise<string> {
    const [business] = await db.insert(businesses).values({ ...details, name }).returning({ id: businesses.id })
    for (const profileId of ownerIds) {
      await db.insert(profiles).values({ id: profileId }).onConflictDoNothing()
      await db.insert(businessMembers).values({ businessId: business!.id, profileId, role: 'owner' })
    }
    return business!.id
  }

  /** The usual per-file fixture: one business with one owner. */
  async function createOwnedBusiness(name = 'Negocio de prueba', details: BusinessDetails = {}) {
    const userId = await createUser()
    const businessId = await createBusiness(name, [userId], details)
    return { userId, businessId }
  }

  /** Calls the app in-process, signed in as `as` (a user id), optionally choosing a business. */
  function request(path: string, options: RequestInit & { as?: string, businessId?: string } = {}) {
    const { as, businessId, headers, ...init } = options
    const h = new Headers(headers)
    if (as) h.set('Authorization', `Bearer ${as}`)
    if (businessId) h.set('X-Business-Id', businessId)
    if (init.body && !h.has('Content-Type')) h.set('Content-Type', 'application/json')
    return app.request(path, { ...init, headers: h })
  }

  return { app, createUser, createBusiness, createOwnedBusiness, request, close }
}
