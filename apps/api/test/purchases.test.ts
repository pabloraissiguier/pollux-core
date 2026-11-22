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

async function created(res: Response) {
  expect(res.status).toBe(201)
  return res.json()
}

const createProduct = async (body: Record<string, unknown> = {}) =>
  created(await post('/products', { code: `CP-${++codes}`, name: `Producto ${codes}`, price: '100.00', ...body }))

const createSupplier = async (name = 'Papelera del Centro') => created(await post('/suppliers', { name }))

async function onHand(productId: string) {
  return (await (await api(`/products/${productId}`)).json()).stock.onHand
}

beforeAll(async () => {
  owner = await t.createOwnedBusiness('Distribuidora Compras')
})

describe('registering a Purchase', () => {
  it('raises On-hand stock by each line\'s quantity and answers the Purchase with its lines and total', async () => {
    const supplier = await createSupplier()
    const vaso = await createProduct({ name: 'Vaso térmico 180cc' })
    const bandeja = await createProduct({ name: 'Bandeja 103' })
    await post('/stock/adjustments', { productId: bandeja.id, quantity: 5, reason: 'initial_count' })

    const res = await post('/purchases', {
      supplierId: supplier.id,
      purchasedOn: '2026-11-20',
      invoiceNumber: '0001-00012345',
      notes: 'Llegó con una caja abollada',
      lines: [
        { productId: vaso.id, quantity: 100, unitCost: '12.35' },
        { productId: bandeja.id, quantity: 3, unitCost: '1000' },
      ],
    })

    const purchase = await created(res)
    expect(purchase).toMatchObject({
      supplier: { id: supplier.id, name: 'Papelera del Centro' },
      purchasedOn: '2026-11-20',
      invoiceNumber: '0001-00012345',
      notes: 'Llegó con una caja abollada',
      createdBy: { id: owner.userId },
      lines: [
        { product: { id: vaso.id, code: vaso.code, name: 'Vaso térmico 180cc' }, quantity: 100, unitCost: '12.35', subtotal: '1235.00' },
        { product: { id: bandeja.id, name: 'Bandeja 103' }, quantity: 3, unitCost: '1000.00', subtotal: '3000.00' },
      ],
      total: '4235.00',
    })
    expect(await onHand(vaso.id)).toBe(100)
    expect(await onHand(bandeja.id)).toBe(8)
  })

  it('records a `purchase` Stock movement per line, pointing at the Purchase', async () => {
    const supplier = await createSupplier()
    const product = await createProduct()

    const purchase = await created(await post('/purchases', {
      supplierId: supplier.id,
      invoiceNumber: 'A-77',
      lines: [
        { productId: product.id, quantity: 10, unitCost: '5.00' },
        { productId: product.id, quantity: 2, unitCost: '0.00' },
      ],
    }))

    expect(await onHand(product.id)).toBe(12)
    const movements = await (await api(`/stock/movements?productId=${product.id}`)).json()
    expect(movements.total).toBe(2)
    expect(movements.items.map((m: { quantity: number }) => m.quantity).sort((a: number, b: number) => a - b)).toEqual([2, 10])
    for (const m of movements.items) {
      expect(m).toMatchObject({ type: 'purchase', purchase: { id: purchase.id, invoiceNumber: 'A-77' }, order: null })
    }
  })

  it('takes today as the Purchase date when none is given', async () => {
    const supplier = await createSupplier()
    const product = await createProduct()
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Cordoba' }).format(new Date())

    const purchase = await created(await post('/purchases', {
      supplierId: supplier.id,
      lines: [{ productId: product.id, quantity: 1, unitCost: '1.00' }],
    }))

    expect(purchase).toMatchObject({ purchasedOn: today, invoiceNumber: null, notes: null })
  })

  it('refuses no lines, a quantity of zero or a negative unit cost, and changes no stock', async () => {
    const supplier = await createSupplier()
    const product = await createProduct()

    const empty = await post('/purchases', { supplierId: supplier.id, lines: [] })
    expect(empty.status).toBe(400)
    expect((await empty.json()).error.details).toHaveProperty('lines')

    const bad = await post('/purchases', {
      supplierId: supplier.id,
      lines: [
        { productId: product.id, quantity: 0, unitCost: '1.00' },
        { productId: product.id, quantity: 1, unitCost: '-1.00' },
      ],
    })
    expect(bad.status).toBe(400)
    const { error } = await bad.json()
    expect(Object.keys(error.details)).toEqual(expect.arrayContaining(['lines.0.quantity', 'lines.1.unitCost']))
    expect(await onHand(product.id)).toBe(0)
  })

  it('is all or nothing: a Product outside the business fails the whole Purchase', async () => {
    const supplier = await createSupplier()
    const mine = await createProduct()
    const other = await t.createOwnedBusiness('Otra para productos')
    const foreign = await (await t.request('/products', {
      as: other.userId,
      method: 'POST',
      body: JSON.stringify({ code: 'AJENO', name: 'Ajeno', price: '1.00' }),
    })).json()

    const res = await post('/purchases', {
      supplierId: supplier.id,
      lines: [
        { productId: mine.id, quantity: 4, unitCost: '1.00' },
        { productId: foreign.id, quantity: 4, unitCost: '1.00' },
      ],
    })

    expect(res.status).toBe(404)
    expect((await res.json()).error.code).toBe('product_not_found')
    expect(await onHand(mine.id)).toBe(0)
    expect((await (await api(`/purchases?supplierId=${supplier.id}`)).json()).total).toBe(0)
  })

  it('refuses a Supplier from another business', async () => {
    const product = await createProduct()
    const other = await t.createOwnedBusiness('Otra para proveedores')
    const foreign = await (await t.request('/suppliers', {
      as: other.userId,
      method: 'POST',
      body: JSON.stringify({ name: 'Proveedor ajeno' }),
    })).json()

    const res = await post('/purchases', {
      supplierId: foreign.id,
      lines: [{ productId: product.id, quantity: 1, unitCost: '1.00' }],
    })

    expect(res.status).toBe(404)
    expect((await res.json()).error.code).toBe('supplier_not_found')
    expect(await onHand(product.id)).toBe(0)
  })
})

describe('listing Purchases and their detail', () => {
  it('lists Purchases by Supplier and date range, latest first, and shows one in detail', async () => {
    const other = await t.createOwnedBusiness('Otra para listar')
    const as = other.userId
    const call = async (path: string, body?: unknown) =>
      t.request(path, body ? { as, method: 'POST', body: JSON.stringify(body) } : { as })
    const supplierA = await (await call('/suppliers', { name: 'A' })).json()
    const supplierB = await (await call('/suppliers', { name: 'B' })).json()
    const product = await (await call('/products', { code: 'L-1', name: 'Bolsa', price: '1.00' })).json()
    const buy = async (supplierId: string, purchasedOn: string) =>
      (await call('/purchases', { supplierId, purchasedOn, lines: [{ productId: product.id, quantity: 1, unitCost: '2.50' }] })).json()

    const first = await buy(supplierA.id, '2026-10-01')
    const second = await buy(supplierA.id, '2026-10-15')
    const third = await buy(supplierB.id, '2026-11-01')

    const all = await (await call('/purchases')).json()
    expect(all.total).toBe(3)
    expect(all.items.map((p: { id: string }) => p.id)).toEqual([third.id, second.id, first.id])
    expect(all.items[0]).toEqual(third)

    const bySupplier = await (await call(`/purchases?supplierId=${supplierA.id}`)).json()
    expect(bySupplier.items.map((p: { id: string }) => p.id)).toEqual([second.id, first.id])

    const byDate = await (await call('/purchases?from=2026-10-10&to=2026-11-01')).json()
    expect(byDate.items.map((p: { id: string }) => p.id)).toEqual([third.id, second.id])

    const paged = await (await call('/purchases?limit=1&offset=1')).json()
    expect(paged).toMatchObject({ total: 3, items: [{ id: second.id }] })

    const detail = await call(`/purchases/${second.id}`)
    expect(detail.status).toBe(200)
    expect(await detail.json()).toEqual(second)
  })

  it('refuses a date range that ends before it starts', async () => {
    const res = await api('/purchases?from=2026-11-02&to=2026-11-01')
    expect(res.status).toBe(400)
    expect((await res.json()).error.details).toHaveProperty('to')
  })

  it('keeps another business\'s Purchases out of reach', async () => {
    const other = await t.createOwnedBusiness('Otra para ver')
    const as = other.userId
    const call = async (path: string, body: unknown) => (await t.request(path, { as, method: 'POST', body: JSON.stringify(body) })).json()
    const supplier = await call('/suppliers', { name: 'Ajeno' })
    const product = await call('/products', { code: 'X-1', name: 'Ajeno', price: '1.00' })
    const purchase = await call('/purchases', { supplierId: supplier.id, lines: [{ productId: product.id, quantity: 1, unitCost: '1.00' }] })

    const res = await api(`/purchases/${purchase.id}`)
    expect(res.status).toBe(404)
    expect((await res.json()).error.code).toBe('purchase_not_found')
    expect((await (await api(`/purchases?supplierId=${supplier.id}`)).json()).total).toBe(0)
  })
})

describe('Purchases are insert-only', () => {
  it('offers no way to edit or delete a Purchase, and its stock stays', async () => {
    const supplier = await createSupplier()
    const product = await createProduct()
    const purchase = await created(await post('/purchases', {
      supplierId: supplier.id,
      lines: [{ productId: product.id, quantity: 6, unitCost: '3.00' }],
    }))

    for (const method of ['PATCH', 'PUT', 'DELETE']) {
      const res = await api(`/purchases/${purchase.id}`, { method, body: JSON.stringify({ notes: 'cambio' }) })
      expect(res.status).toBe(404)
    }

    expect(await (await api(`/purchases/${purchase.id}`)).json()).toEqual(purchase)
    expect(await onHand(product.id)).toBe(6)
  })
})
