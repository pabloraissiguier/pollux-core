import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { setupTestApp } from './fixtures'

const DASHBOARD = 'http://localhost:4123'
const OTHER_DASHBOARD = 'https://pollux.example.com'
const STRANGER = 'https://evil.example.com'

const t = setupTestApp({ corsOrigins: [DASHBOARD, OTHER_DASHBOARD] })
afterAll(() => t.close())

function preflight(origin: string, method = 'GET') {
  return t.request('/me', {
    method: 'OPTIONS',
    headers: {
      'Origin': origin,
      'Access-Control-Request-Method': method,
      'Access-Control-Request-Headers': 'authorization, content-type, x-business-id',
    },
  })
}

describe('CORS for the dashboard', () => {
  let owner: { userId: string, businessId: string }

  beforeAll(async () => {
    owner = await t.createOwnedBusiness('Distribuidora CORS')
  })

  it('answers a preflight from an allowed origin without a token', async () => {
    const res = await preflight(DASHBOARD, 'PATCH')

    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(DASHBOARD)
    const headers = res.headers.get('Access-Control-Allow-Headers')!.toLowerCase().split(/\s*,\s*/)
    expect(headers).toEqual(expect.arrayContaining(['authorization', 'content-type', 'x-business-id']))
    const methods = res.headers.get('Access-Control-Allow-Methods')!.split(/\s*,\s*/)
    expect(methods).toEqual(expect.arrayContaining(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']))
  })

  it('allows every origin in the list', async () => {
    const res = await preflight(OTHER_DASHBOARD)

    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(OTHER_DASHBOARD)
  })

  it('gives an origin that is not listed no Access-Control-Allow-Origin', async () => {
    const res = await preflight(STRANGER)

    expect(res.status).not.toBe(401)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })

  it('lets the dashboard read GET /me', async () => {
    const res = await t.request('/me', { as: owner.userId, headers: { Origin: DASHBOARD } })

    expect(res.status).toBe(200)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(DASHBOARD)
    expect((await res.json()).activeBusinessId).toBe(owner.businessId)
  })

  it('does not expose GET /me to an origin that is not listed', async () => {
    const res = await t.request('/me', { as: owner.userId, headers: { Origin: STRANGER } })

    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })

  it('lets the dashboard read a 401 without a token', async () => {
    const res = await t.request('/me', { headers: { Origin: DASHBOARD } })

    expect(res.status).toBe(401)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(DASHBOARD)
    expect((await res.json()).error.code).toBe('unauthorized')
  })

  it('lets the dashboard read a 403 for a business the user is not a member of', async () => {
    const other = await t.createOwnedBusiness('Otro negocio CORS')

    const res = await t.request('/me', { as: owner.userId, businessId: other.businessId, headers: { Origin: DASHBOARD } })

    expect(res.status).toBe(403)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(DASHBOARD)
    expect((await res.json()).error.code).toBe('not_a_member')
  })

  it('lets the dashboard read a 400 for a malformed X-Business-Id', async () => {
    const res = await t.request('/me', { as: owner.userId, businessId: 'not-a-uuid', headers: { Origin: DASHBOARD } })

    expect(res.status).toBe(400)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(DASHBOARD)
    expect((await res.json()).error.code).toBe('validation_error')
  })

  it('lets the dashboard read a 404 for an unknown route', async () => {
    const res = await t.request('/no-such-route', { as: owner.userId, headers: { Origin: DASHBOARD } })

    expect(res.status).toBe(404)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(DASHBOARD)
    expect((await res.json()).error.code).toBe('not_found')
  })
})
