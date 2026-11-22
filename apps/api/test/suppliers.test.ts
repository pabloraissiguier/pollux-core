import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { setupTestApp } from './fixtures'

const t = setupTestApp()
afterAll(() => t.close())

let owner: { userId: string, businessId: string }

function api(path: string, init: RequestInit = {}) {
  return t.request(path, { as: owner.userId, ...init })
}

function post(path: string, body: unknown) {
  return api(path, { method: 'POST', body: JSON.stringify(body) })
}

function patch(path: string, body: unknown) {
  return api(path, { method: 'PATCH', body: JSON.stringify(body) })
}

async function createSupplier(body: Record<string, unknown>) {
  const res = await post('/suppliers', body)
  expect(res.status).toBe(201)
  return res.json()
}

beforeAll(async () => {
  owner = await t.createOwnedBusiness('Distribuidora Proveedores')
})

describe('Suppliers', () => {
  it('creates a Supplier with name, CUIT, phone and notes, and shows it in detail', async () => {
    const res = await post('/suppliers', {
      name: 'Papelera del Centro',
      cuit: '20123456786',
      phone: '3468 400000',
      notes: 'Entrega los martes',
    })

    expect(res.status).toBe(201)
    const supplier = await res.json()
    expect(supplier).toMatchObject({
      name: 'Papelera del Centro',
      cuit: '20-12345678-6',
      phone: '3468 400000',
      notes: 'Entrega los martes',
    })
    const detail = await api(`/suppliers/${supplier.id}`)
    expect(detail.status).toBe(200)
    expect(await detail.json()).toEqual(supplier)
  })

  it('creates a Supplier with only a name', async () => {
    const supplier = await createSupplier({ name: 'Plásticos Sur', cuit: '', phone: '' })
    expect(supplier).toMatchObject({ name: 'Plásticos Sur', cuit: null, phone: null, notes: null })
  })

  it('refuses a missing name or an invalid CUIT with field details', async () => {
    const res = await post('/suppliers', { name: ' ', cuit: '20123456780' })

    expect(res.status).toBe(400)
    const { error } = await res.json()
    expect(error.code).toBe('validation_error')
    expect(Object.keys(error.details)).toEqual(expect.arrayContaining(['name', 'cuit']))
  })

  it('edits only the given fields, and null clears an optional one', async () => {
    const supplier = await createSupplier({ name: 'Descartables Norte', phone: '111', notes: 'Viejo' })

    const res = await patch(`/suppliers/${supplier.id}`, { phone: '222', notes: null })

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ id: supplier.id, name: 'Descartables Norte', phone: '222', notes: null })
    expect(await (await api(`/suppliers/${supplier.id}`)).json()).toMatchObject({ phone: '222', notes: null })
  })

  it('lists Suppliers by name and searches by name or CUIT, with or without dashes', async () => {
    const other = await t.createOwnedBusiness('Otra para listar')
    const as = other.userId
    const create = (body: unknown) => t.request('/suppliers', { as, method: 'POST', body: JSON.stringify(body) })
    await create({ name: 'Zeta Envases' })
    await create({ name: 'Alfa Bolsas', cuit: '30-71234567-1' })
    await create({ name: 'Beta Bolsas' })

    const all = await (await t.request('/suppliers', { as })).json()
    expect(all.total).toBe(3)
    expect(all.items.map((s: { name: string }) => s.name)).toEqual(['Alfa Bolsas', 'Beta Bolsas', 'Zeta Envases'])

    const byName = await (await t.request('/suppliers?q=bolsas', { as })).json()
    expect(byName.items.map((s: { name: string }) => s.name)).toEqual(['Alfa Bolsas', 'Beta Bolsas'])

    const byCuit = await (await t.request('/suppliers?q=30712345671', { as })).json()
    expect(byCuit.items.map((s: { name: string }) => s.name)).toEqual(['Alfa Bolsas'])

    const paged = await (await t.request('/suppliers?limit=1&offset=1', { as })).json()
    expect(paged).toMatchObject({ total: 3, items: [{ name: 'Beta Bolsas' }] })
  })

  it('keeps another business\'s Suppliers out of reach', async () => {
    const other = await t.createOwnedBusiness('Otra distribuidora')
    const res = await t.request('/suppliers', {
      as: other.userId,
      method: 'POST',
      body: JSON.stringify({ name: 'Proveedor ajeno' }),
    })
    const foreign = await res.json()

    expect((await api(`/suppliers/${foreign.id}`)).status).toBe(404)
    const edit = await patch(`/suppliers/${foreign.id}`, { name: 'Robado' })
    expect(edit.status).toBe(404)
    expect((await edit.json()).error.code).toBe('supplier_not_found')
    const list = await (await api('/suppliers?q=ajeno')).json()
    expect(list.total).toBe(0)
  })
})
