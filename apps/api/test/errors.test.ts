import { afterAll, describe, expect, it } from 'vitest'
import { setupTestApp } from './fixtures'

const t = setupTestApp()
afterAll(() => t.close())

describe('error shape', () => {
  it('answers an unknown route with a 404 in the API error shape, in Spanish', async () => {
    const { userId } = await t.createOwnedBusiness()

    const res = await t.request('/no-existe', { as: userId })

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({
      error: { code: 'not_found', message: 'No encontramos lo que buscabas' },
    })
  })
})
