import { randomUUID } from 'node:crypto'
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

async function createCategory(name: string): Promise<{ id: string, name: string }> {
  const res = await post('/categories', { name })
  expect(res.status).toBe(201)
  return res.json()
}

async function createProduct(body: Record<string, unknown>): Promise<{ id: string, price: string }> {
  const res = await post('/products', { name: 'Producto', ...body })
  expect(res.status).toBe(201)
  return res.json()
}

async function getPrice(productId: string) {
  return (await (await api(`/products/${productId}`)).json()).price as string
}

async function getHistory(productId: string) {
  return (await (await api(`/products/${productId}/price-history`)).json()) as {
    items: { oldPrice: string | null, newPrice: string, changedBy: { id: string } | null }[]
    total: number
  }
}

beforeAll(async () => {
  owner = await t.createOwnedBusiness('Distribuidora Precios')
})

describe('previewing a Category Price update', () => {
  it('returns each Active Product with its old and new Price, rounded to cents, by name', async () => {
    const category = await createCategory('Vasos')
    const vaso = await createProduct({ code: 'PV-1', name: 'Vaso 180 cc', categoryId: category.id, price: '1000.00' })
    const plato = await createProduct({ code: 'PV-2', name: 'Plato chico', categoryId: category.id, price: '333.33' })

    const res = await post(`/categories/${category.id}/price-update/preview`, { percent: '12.5' })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      category: { id: category.id, name: 'Vasos' },
      percent: '12.50',
      items: [
        // 333.33 × 1.125 = 374.99625 → 375.00
        { productId: plato.id, code: 'PV-2', name: 'Plato chico', oldPrice: '333.33', newPrice: '375.00' },
        { productId: vaso.id, code: 'PV-1', name: 'Vaso 180 cc', oldPrice: '1000.00', newPrice: '1125.00' },
      ],
    })
  })

  it('writes nothing: Prices and price history stay as they were', async () => {
    const category = await createCategory('Bandejas')
    const bandeja = await createProduct({ code: 'PV-3', name: 'Bandeja', categoryId: category.id, price: '200.00' })

    const res = await post(`/categories/${category.id}/price-update/preview`, { percent: '50' })
    expect(res.status).toBe(200)

    expect(await getPrice(bandeja.id)).toBe('200.00')
    expect((await getHistory(bandeja.id)).total).toBe(1)
  })
})

describe('applying a Category Price update', () => {
  it('changes every Active Product in the Category and keeps one history row per Product', async () => {
    const category = await createCategory('Servilletas')
    const blanca = await createProduct({ code: 'PA-1', name: 'Servilleta blanca', categoryId: category.id, price: '100.00' })
    const color = await createProduct({ code: 'PA-2', name: 'Servilleta color', categoryId: category.id, price: '0.15' })

    const res = await post(`/categories/${category.id}/price-update`, { percent: '10' })

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      category: { id: category.id, name: 'Servilletas' },
      percent: '10.00',
      items: [
        { productId: blanca.id, oldPrice: '100.00', newPrice: '110.00' },
        // 0.15 × 1.1 = 0.165 → 0.17
        { productId: color.id, oldPrice: '0.15', newPrice: '0.17' },
      ],
    })
    expect(await getPrice(blanca.id)).toBe('110.00')
    expect(await getPrice(color.id)).toBe('0.17')

    const history = await getHistory(blanca.id)
    expect(history.total).toBe(2)
    expect(history.items[0]).toMatchObject({ oldPrice: '100.00', newPrice: '110.00', changedBy: { id: owner.userId } })
    expect((await getHistory(color.id)).items[0]).toMatchObject({ oldPrice: '0.15', newPrice: '0.17' })
  })

  it('leaves Inactive Products and Products of other Categories untouched', async () => {
    const category = await createCategory('Films')
    const other = await createCategory('Films industriales')
    const active = await createProduct({ code: 'PA-3', name: 'Film 30 cm', categoryId: category.id, price: '500.00' })
    const inactive = await createProduct({ code: 'PA-4', name: 'Film 45 cm', categoryId: category.id, price: '500.00' })
    const elsewhere = await createProduct({ code: 'PA-5', name: 'Film 50 cm', categoryId: other.id, price: '500.00' })
    await api(`/products/${inactive.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: false }) })

    const res = await post(`/categories/${category.id}/price-update`, { percent: '20' })

    expect(res.status).toBe(200)
    expect((await res.json()).items.map((i: { productId: string }) => i.productId)).toEqual([active.id])
    expect(await getPrice(active.id)).toBe('600.00')
    expect(await getPrice(inactive.id)).toBe('500.00')
    expect(await getPrice(elsewhere.id)).toBe('500.00')
    expect((await getHistory(inactive.id)).total).toBe(1)
  })

  it('lowers Prices with a negative percentage, down to 0 at -100', async () => {
    const category = await createCategory('Liquidación')
    const rollo = await createProduct({ code: 'PA-6', name: 'Rollo cocina', categoryId: category.id, price: '999.99' })

    const drop = await post(`/categories/${category.id}/price-update`, { percent: '-15' })
    expect(drop.status).toBe(200)
    // 999.99 × 0.85 = 849.9915 → 849.99
    expect(await getPrice(rollo.id)).toBe('849.99')

    const toZero = await post(`/categories/${category.id}/price-update`, { percent: '-100' })
    expect(toZero.status).toBe(200)
    expect(await getPrice(rollo.id)).toBe('0.00')
  })

  it('rejects a percentage that would leave a Price below 0, and writes nothing', async () => {
    const category = await createCategory('Bolsas')
    const bolsa = await createProduct({ code: 'PA-7', name: 'Bolsa camiseta', categoryId: category.id, price: '80.00' })

    const res = await post(`/categories/${category.id}/price-update`, { percent: '-100.01' })
    const preview = await post(`/categories/${category.id}/price-update/preview`, { percent: '-150' })

    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: { code: 'validation_error', details: { percent: expect.any(Array) } } })
    expect(preview.status).toBe(400)
    expect(await getPrice(bolsa.id)).toBe('80.00')
  })

  it('rejects a zero percentage and one sent as a number', async () => {
    const category = await createCategory('Cubiertos')

    expect((await post(`/categories/${category.id}/price-update`, { percent: '0' })).status).toBe(400)
    expect((await post(`/categories/${category.id}/price-update`, { percent: 10 })).status).toBe(400)
  })

  it('answers an empty list for a Category with no Active Products', async () => {
    const category = await createCategory('Vacía')

    const res = await post(`/categories/${category.id}/price-update`, { percent: '5' })

    expect(res.status).toBe(200)
    expect((await res.json()).items).toEqual([])
  })

  it('answers 404 for a missing Category or one from another business', async () => {
    const stranger = await t.createOwnedBusiness('Otra distribuidora')
    const theirs = await (await t.request('/categories', {
      as: stranger.userId,
      method: 'POST',
      body: JSON.stringify({ name: 'Ajena' }),
    })).json()

    for (const id of [randomUUID(), theirs.id]) {
      const preview = await post(`/categories/${id}/price-update/preview`, { percent: '5' })
      const apply = await post(`/categories/${id}/price-update`, { percent: '5' })
      expect(preview.status).toBe(404)
      expect(apply.status).toBe(404)
      expect((await apply.json()).error.code).toBe('category_not_found')
    }
  })
})
