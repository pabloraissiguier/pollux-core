import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { setupTestApp } from './fixtures'

const t = setupTestApp()
afterAll(() => t.close())

describe('GET /me', () => {
  let owner: { userId: string, businessId: string }

  beforeAll(async () => {
    owner = await t.createOwnedBusiness('Distribuidora Uno')
  })

  it('returns the profile and its only business, selected automatically', async () => {
    const res = await t.request('/me', { as: owner.userId })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      profile: { id: owner.userId, fullName: null },
      businesses: [{ id: owner.businessId, name: 'Distribuidora Uno', role: 'owner' }],
      activeBusinessId: owner.businessId,
    })
  })

  it('lists every business of a user with several, and selects the one in X-Business-Id', async () => {
    const userId = await t.createUser()
    const first = await t.createBusiness('Almacén A', [userId])
    const second = await t.createBusiness('Almacén B', [userId])

    const res = await t.request('/me', { as: userId, businessId: second })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.businesses).toEqual([
      { id: first, name: 'Almacén A', role: 'owner' },
      { id: second, name: 'Almacén B', role: 'owner' },
    ])
    expect(body.activeBusinessId).toBe(second)
  })

  it('selects no business for a user with several when no X-Business-Id is sent', async () => {
    const userId = await t.createUser()
    await t.createBusiness('Kiosco A', [userId])
    await t.createBusiness('Kiosco B', [userId])

    const res = await t.request('/me', { as: userId })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.businesses).toHaveLength(2)
    expect(body.activeBusinessId).toBeNull()
  })

  it('creates the profile the first time a signed-up user calls the API', async () => {
    const userId = await t.createUser()

    const first = await t.request('/me', { as: userId })
    const second = await t.request('/me', { as: userId })

    expect(first.status).toBe(200)
    expect(await first.json()).toEqual({
      profile: { id: userId, fullName: null },
      businesses: [],
      activeBusinessId: null,
    })
    expect(second.status).toBe(200)
  })

  it('refuses a business the user is not a member of with 403', async () => {
    const other = await t.createOwnedBusiness('Otro negocio')

    const res = await t.request('/me', { as: owner.userId, businessId: other.businessId })

    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({
      error: { code: 'not_a_member', message: expect.any(String) },
    })
  })

  it('refuses a business id that does not exist with 403', async () => {
    const res = await t.request('/me', { as: owner.userId, businessId: randomUUID() })

    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toBe('not_a_member')
  })

  it('rejects a malformed X-Business-Id as a validation error', async () => {
    const res = await t.request('/me', { as: owner.userId, businessId: 'not-a-uuid' })

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({
      error: {
        code: 'validation_error',
        message: expect.any(String),
        details: { 'x-business-id': [expect.any(String)] },
      },
    })
  })

  it('rejects a request without a token with 401', async () => {
    const res = await t.request('/me')

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({
      error: { code: 'unauthorized', message: 'Iniciá sesión para continuar' },
    })
  })

  it('rejects an invalid token with 401', async () => {
    const res = await t.request('/me', { headers: { Authorization: 'Bearer not-a-real-token' } })

    expect(res.status).toBe(401)
    expect((await res.json()).error.code).toBe('unauthorized')
  })
})
