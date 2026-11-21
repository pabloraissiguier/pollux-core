import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { setupTestApp } from './fixtures'

const t = setupTestApp()
afterAll(() => t.close())

let owner: { userId: string, businessId: string }
let codes = 0

function api(path: string, init: RequestInit = {}) {
  return t.request(path, { as: owner.userId, ...init })
}

function post(path: string, body: unknown) {
  return api(path, { method: 'POST', body: JSON.stringify(body) })
}

async function createProduct(body: Record<string, unknown> = {}) {
  const res = await post('/products', { code: `ST-${++codes}`, name: 'Producto', price: '100.00', ...body })
  expect(res.status).toBe(201)
  return res.json()
}

async function getProduct(id: string) {
  const res = await api(`/products/${id}`)
  expect(res.status).toBe(200)
  return res.json()
}

/** A Product in a different business, for tenant isolation checks. */
async function createForeignProduct() {
  const other = await t.createOwnedBusiness('Otra distribuidora')
  const res = await t.request('/products', {
    as: other.userId,
    method: 'POST',
    body: JSON.stringify({ code: `AJENO-${++codes}`, name: 'Ajeno', price: '1.00' }),
  })
  expect(res.status).toBe(201)
  return res.json()
}

beforeAll(async () => {
  owner = await t.createOwnedBusiness('Distribuidora Stock')
})

describe('stock figures on Products', () => {
  it('shows On-hand, Reserved and Available stock at zero for a new Product, in detail and list', async () => {
    const product = await createProduct({ name: 'Servilleta 33x33' })

    expect(product.stock).toEqual({ onHand: 0, reserved: 0, available: 0 })
    expect((await getProduct(product.id)).stock).toEqual({ onHand: 0, reserved: 0, available: 0 })
    const list = await (await api('/products?q=Servilleta')).json()
    expect(list.items[0].stock).toEqual({ onHand: 0, reserved: 0, available: 0 })
  })
})

describe('Stock adjustments', () => {
  it('changes On-hand stock by the adjusted quantity, with a reason and optional notes', async () => {
    const product = await createProduct()

    const counted = await post('/stock/adjustments', { productId: product.id, quantity: 12, reason: 'count_correction' })
    expect(counted.status).toBe(201)
    expect((await counted.json()).stock).toEqual({ onHand: 12, reserved: 0, available: 12 })

    const broken = await post('/stock/adjustments', {
      productId: product.id,
      quantity: -3,
      reason: 'breakage',
      notes: 'Se cayó una caja',
    })
    expect(broken.status).toBe(201)
    expect(await broken.json()).toMatchObject({ id: product.id, stock: { onHand: 9, reserved: 0, available: 9 } })
    expect((await getProduct(product.id)).stock.onHand).toBe(9)
  })

  it('lets On-hand and Available stock go negative instead of blocking', async () => {
    const product = await createProduct()

    const res = await post('/stock/adjustments', { productId: product.id, quantity: -5, reason: 'other' })

    expect(res.status).toBe(201)
    expect((await res.json()).stock).toEqual({ onHand: -5, reserved: 0, available: -5 })
  })

  it('applies every one of several adjustments made at the same moment', async () => {
    const product = await createProduct()

    const results = await Promise.all(Array.from({ length: 5 }, () =>
      post('/stock/adjustments', { productId: product.id, quantity: 2, reason: 'count_correction' })))

    expect(results.map(r => r.status)).toEqual([201, 201, 201, 201, 201])
    expect((await getProduct(product.id)).stock.onHand).toBe(10)
  })

  it('rejects a zero quantity, a fractional quantity and an unknown reason', async () => {
    const product = await createProduct()

    const zero = await post('/stock/adjustments', { productId: product.id, quantity: 0, reason: 'other' })
    const fraction = await post('/stock/adjustments', { productId: product.id, quantity: 1.5, reason: 'other' })
    const reason = await post('/stock/adjustments', { productId: product.id, quantity: 1, reason: 'theft' })

    for (const res of [zero, fraction, reason]) {
      expect(res.status).toBe(400)
      expect((await res.json()).error.code).toBe('validation_error')
    }
    expect((await getProduct(product.id)).stock.onHand).toBe(0)
  })

  it('answers 404 for another business\'s Product', async () => {
    const foreign = await createForeignProduct()

    const adjusted = await post('/stock/adjustments', { productId: foreign.id, quantity: 5, reason: 'other' })

    expect(adjusted.status).toBe(404)
    expect((await adjusted.json()).error.code).toBe('product_not_found')
  })
})

describe('the bulk initial count', () => {
  async function movementsOf(productId: string) {
    return (await (await api(`/stock/movements?productId=${productId}`)).json()).items
  }

  it('sets each Product to its counted quantity through an initial_count adjustment for the difference', async () => {
    const empty = await createProduct()
    const exact = await createProduct()
    const over = await createProduct()
    await post('/stock/adjustments', { productId: exact.id, quantity: 5, reason: 'other' })
    await post('/stock/adjustments', { productId: over.id, quantity: 8, reason: 'other' })

    const res = await post('/stock/initial-count', {
      items: [
        { productId: empty.id, quantity: 10 },
        { productId: exact.id, quantity: 5 },
        { productId: over.id, quantity: 3 },
      ],
    })

    expect(res.status).toBe(200)
    const { items } = await res.json()
    expect(items.map((i: { product: { id: string, stock: unknown }, difference: number }) => [i.product.id, i.product.stock, i.difference]))
      .toEqual([
        [empty.id, { onHand: 10, reserved: 0, available: 10 }, 10],
        [exact.id, { onHand: 5, reserved: 0, available: 5 }, 0],
        [over.id, { onHand: 3, reserved: 0, available: 3 }, -5],
      ])
    expect((await getProduct(over.id)).stock.onHand).toBe(3)
    expect(await movementsOf(empty.id)).toEqual([
      expect.objectContaining({ type: 'adjustment', reason: 'initial_count', quantity: 10 }),
    ])
    expect(await movementsOf(over.id)).toEqual([
      expect.objectContaining({ type: 'adjustment', reason: 'initial_count', quantity: -5 }),
      expect.objectContaining({ reason: 'other', quantity: 8 }),
    ])
  })

  it('skips Products whose count matches their On-hand stock, recording no movement', async () => {
    const product = await createProduct()
    await post('/stock/adjustments', { productId: product.id, quantity: 4, reason: 'other' })

    await post('/stock/initial-count', { items: [{ productId: product.id, quantity: 4 }] })

    expect(await movementsOf(product.id)).toHaveLength(1)
  })

  it('changes nothing when one of the Products is from another business', async () => {
    const mine = await createProduct()
    const foreign = await createForeignProduct()

    const res = await post('/stock/initial-count', {
      items: [{ productId: mine.id, quantity: 7 }, { productId: foreign.id, quantity: 1 }],
    })

    expect(res.status).toBe(404)
    expect((await res.json()).error.code).toBe('product_not_found')
    expect((await getProduct(mine.id)).stock.onHand).toBe(0)
  })

  it('rejects an empty list, a negative count and a Product listed twice', async () => {
    const product = await createProduct()

    const empty = await post('/stock/initial-count', { items: [] })
    const negative = await post('/stock/initial-count', { items: [{ productId: product.id, quantity: -1 }] })
    const twice = await post('/stock/initial-count', {
      items: [{ productId: product.id, quantity: 1 }, { productId: product.id, quantity: 2 }],
    })

    for (const res of [empty, negative, twice]) {
      expect(res.status).toBe(400)
      expect((await res.json()).error.code).toBe('validation_error')
    }
  })
})

describe('a Product\'s Stock movements', () => {
  it('lists every change newest first, with its type, quantity, cause and who made it', async () => {
    const product = await createProduct()
    await post('/stock/adjustments', { productId: product.id, quantity: 20, reason: 'initial_count' })
    await post('/stock/adjustments', { productId: product.id, quantity: -2, reason: 'breakage', notes: 'Rotura en depósito' })

    const res = await api(`/stock/movements?productId=${product.id}`)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      items: [
        {
          id: expect.any(String),
          type: 'adjustment',
          quantity: -2,
          reason: 'breakage',
          notes: 'Rotura en depósito',
          order: null,
          purchase: null,
          createdBy: { id: owner.userId, fullName: null },
          createdAt: expect.any(String),
        },
        expect.objectContaining({ type: 'adjustment', quantity: 20, reason: 'initial_count', notes: null }),
      ],
      total: 2,
    })
  })

  it('pages with limit and offset', async () => {
    const product = await createProduct()
    for (const quantity of [1, 2, 3]) {
      await post('/stock/adjustments', { productId: product.id, quantity, reason: 'other' })
    }

    const page = await (await api(`/stock/movements?productId=${product.id}&limit=1&offset=1`)).json()

    expect(page.total).toBe(3)
    expect(page.items.map((m: { quantity: number }) => m.quantity)).toEqual([2])
  })

  it('requires a Product, and answers 404 for another business\'s Product', async () => {
    const foreign = await createForeignProduct()

    const missing = await api('/stock/movements')
    const other = await api(`/stock/movements?productId=${foreign.id}`)

    expect(missing.status).toBe(400)
    expect(other.status).toBe(404)
    expect((await other.json()).error.code).toBe('product_not_found')
  })
})
