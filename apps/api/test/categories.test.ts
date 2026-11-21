import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { setupTestApp } from './fixtures'

const t = setupTestApp()
afterAll(() => t.close())

let owner: { userId: string, businessId: string }

beforeAll(async () => {
  owner = await t.createOwnedBusiness('Distribuidora Categorías')
})

function api(path: string, init: RequestInit = {}) {
  return t.request(path, { as: owner.userId, ...init })
}

function post(path: string, body: unknown) {
  return api(path, { method: 'POST', body: JSON.stringify(body) })
}

function patch(path: string, body: unknown) {
  return api(path, { method: 'PATCH', body: JSON.stringify(body) })
}

describe('Categories', () => {
  it('creates a Category', async () => {
    const res = await post('/categories', { name: '  Descartables  ' })

    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({
      id: expect.any(String),
      name: 'Descartables',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    })
  })

  it('rejects a Category without a name', async () => {
    const res = await post('/categories', { name: ' ' })

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({
      error: { code: 'validation_error', message: expect.any(String), details: { name: ['Ingresá el nombre'] } },
    })
  })

  it('refuses a second Category with the same name in the business with 409', async () => {
    await post('/categories', { name: 'Bolsas' })

    const res = await post('/categories', { name: 'Bolsas' })

    expect(res.status).toBe(409)
    expect((await res.json()).error.code).toBe('category_name_taken')
  })

  it('renames a Category', async () => {
    const created = await (await post('/categories', { name: 'Limpeza' })).json()

    const res = await patch(`/categories/${created.id}`, { name: 'Limpieza' })

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ id: created.id, name: 'Limpieza' })
  })

  it('refuses renaming a Category to a name another one has with 409', async () => {
    await post('/categories', { name: 'Papelería' })
    const other = await (await post('/categories', { name: 'Papeleria' })).json()

    const res = await patch(`/categories/${other.id}`, { name: 'Papelería' })

    expect(res.status).toBe(409)
    expect((await res.json()).error.code).toBe('category_name_taken')
  })

  it('answers 404 when renaming a Category that does not exist', async () => {
    const res = await patch(`/categories/${randomUUID()}`, { name: 'Nada' })

    expect(res.status).toBe(404)
    expect((await res.json()).error.code).toBe('category_not_found')
  })

  it('lists Categories by name with their total', async () => {
    const { businessId, userId } = await t.createOwnedBusiness('Negocio con categorías')
    for (const name of ['Vasos', 'Bandejas', 'Cubiertos']) {
      await t.request('/categories', { as: userId, method: 'POST', body: JSON.stringify({ name }) })
    }

    const res = await t.request('/categories?limit=2', { as: userId, businessId })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.total).toBe(3)
    expect(body.items.map((c: { name: string }) => c.name)).toEqual(['Bandejas', 'Cubiertos'])
  })
})

describe('Categories across businesses', () => {
  it('lets two businesses use the same Category name, and each sees only its own', async () => {
    const other = await t.createOwnedBusiness('Otro negocio')
    await post('/categories', { name: 'Compartida' })

    const created = await t.request('/categories', { as: other.userId, method: 'POST', body: JSON.stringify({ name: 'Compartida' }) })
    const list = await (await t.request('/categories', { as: other.userId })).json()

    expect(created.status).toBe(201)
    expect(list).toEqual({ items: [expect.objectContaining({ name: 'Compartida' })], total: 1 })
  })

  it('answers 404 when renaming another business\'s Category', async () => {
    const other = await t.createOwnedBusiness('Negocio ajeno')
    const theirs = await (await t.request('/categories', { as: other.userId, method: 'POST', body: JSON.stringify({ name: 'Ajena' }) })).json()

    const res = await patch(`/categories/${theirs.id}`, { name: 'Robada' })

    expect(res.status).toBe(404)
    expect((await res.json()).error.code).toBe('category_not_found')
  })
})
