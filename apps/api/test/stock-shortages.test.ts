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

async function ok(res: Response, status = 200) {
  expect(res.status).toBe(status)
  return res.json()
}

async function createProduct(name: string) {
  return ok(await post('/products', { code: `SH-${++codes}`, name, price: '100.00' }), 201)
}

async function setOnHand(productId: string, quantity: number) {
  await ok(await post('/stock/initial-count', { items: [{ productId, quantity }] }))
}

async function createCustomer(name: string, city: string) {
  return ok(await post('/customers', { name, branches: [{ address: 'San Martín 123', city }] }), 201)
}

async function createOrder(customer: { id: string, branches: { id: string }[] }, deliveryDate: string, lines: { productId: string, quantity: number }[]) {
  return ok(await post('/orders', { customerId: customer.id, branchId: customer.branches[0]!.id, deliveryDate, lines }), 201)
}

async function shortages(query = '') {
  return ok(await api(`/stock/shortages${query}`))
}

/** The shortage item for one Product, or undefined when it isn't short. */
async function shortageOf(productId: string) {
  const list = await shortages('?limit=200')
  return list.items.find((i: { product: { id: string } }) => i.product.id === productId)
}

beforeAll(async () => {
  owner = await t.createOwnedBusiness('Distribuidora Faltantes')
})

describe('Stock shortages', () => {
  it('answers an empty list when no Product is short', async () => {
    const fresh = await t.createOwnedBusiness('Sin faltantes')
    const product = await ok(await t.request('/products', {
      as: fresh.userId,
      method: 'POST',
      body: JSON.stringify({ code: 'OK-1', name: 'Con stock', price: '1.00' }),
    }), 201)
    await ok(await t.request('/stock/adjustments', {
      as: fresh.userId,
      method: 'POST',
      body: JSON.stringify({ productId: product.id, quantity: 3, reason: 'count_correction' }),
    }), 201)

    expect(await ok(await t.request('/stock/shortages', { as: fresh.userId }))).toEqual({ items: [], total: 0 })
  })

  it('lists each Product with negative Available stock, its shortfall and the Pending Orders that reserve it', async () => {
    const vaso = await createProduct('Vaso térmico')
    const tapa = await createProduct('Tapa plana')
    await setOnHand(vaso.id, 5)
    await setOnHand(tapa.id, 20)
    const pepe = await createCustomer('Kiosco Don Pepe', 'Corral de Bustos')
    const ana = await createCustomer('Almacén Ana', 'Isla Verde')

    const first = await createOrder(pepe, '2026-11-24', [{ productId: vaso.id, quantity: 4 }, { productId: tapa.id, quantity: 4 }])
    const second = await createOrder(ana, '2026-11-25', [{ productId: vaso.id, quantity: 4 }, { productId: vaso.id, quantity: 1 }])

    expect(await shortageOf(vaso.id)).toEqual({
      product: { id: vaso.id, code: vaso.code, name: 'Vaso térmico' },
      stock: { onHand: 5, reserved: 9, available: -4 },
      shortfall: 4,
      orders: [
        {
          id: first.id,
          number: first.number,
          deliveryDate: '2026-11-24',
          customer: { id: pepe.id, name: 'Kiosco Don Pepe' },
          branch: { city: 'Corral de Bustos' },
          quantity: 4,
        },
        {
          id: second.id,
          number: second.number,
          deliveryDate: '2026-11-25',
          customer: { id: ana.id, name: 'Almacén Ana' },
          branch: { city: 'Isla Verde' },
          quantity: 5,
        },
      ],
    })
    expect(await shortageOf(tapa.id)).toBeUndefined()
  })

  it('includes Inactive Products, since a Pending Order may still hold them', async () => {
    const product = await createProduct('Bandeja discontinuada')
    const customer = await createCustomer('Bar Central', 'Corral de Bustos')
    await createOrder(customer, '2026-11-24', [{ productId: product.id, quantity: 2 }])
    await ok(await api(`/products/${product.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: false }) }))

    expect(await shortageOf(product.id)).toMatchObject({ shortfall: 2, stock: { available: -2 } })
  })

  it('includes a Product short only because its On-hand stock is negative, with no Orders', async () => {
    const product = await createProduct('Caja rota')
    await ok(await post('/stock/adjustments', { productId: product.id, quantity: -2, reason: 'breakage' }), 201)

    expect(await shortageOf(product.id)).toMatchObject({ shortfall: 2, stock: { onHand: -2, reserved: 0, available: -2 }, orders: [] })
  })

  it('sorts by shortfall, largest first, and paginates', async () => {
    const shop = await t.createOwnedBusiness('Orden de faltantes')
    const as = shop.userId
    const call = (path: string, body?: unknown) => t.request(path, body === undefined ? { as } : { as, method: 'POST', body: JSON.stringify(body) })
    const customer = await ok(await call('/customers', { name: 'Cliente', branches: [{ address: 'A 1', city: 'Laborde' }] }), 201)
    const short = async (code: string, missing: number) => {
      const p = await ok(await call('/products', { code, name: code, price: '1.00' }), 201)
      await ok(await call('/orders', {
        customerId: customer.id,
        branchId: customer.branches[0].id,
        deliveryDate: '2026-11-24',
        lines: [{ productId: p.id, quantity: missing }],
      }), 201)
    }
    await short('POCO', 1)
    await short('MUCHO', 30)
    await short('MEDIO', 7)

    const all = await ok(await call('/stock/shortages'))
    expect(all.total).toBe(3)
    expect(all.items.map((i: { product: { code: string }, shortfall: number }) => [i.product.code, i.shortfall])).toEqual([['MUCHO', 30], ['MEDIO', 7], ['POCO', 1]])

    const page = await ok(await call('/stock/shortages?limit=1&offset=1'))
    expect(page.total).toBe(3)
    expect(page.items.map((i: { product: { code: string } }) => i.product.code)).toEqual(['MEDIO'])
  })

  it('drops a Product once a Stock adjustment covers it', async () => {
    const product = await createProduct('Film')
    const customer = await createCustomer('Kiosco Ajuste', 'Laborde')
    await createOrder(customer, '2026-11-24', [{ productId: product.id, quantity: 6 }])
    expect(await shortageOf(product.id)).toMatchObject({ shortfall: 6 })

    await ok(await post('/stock/adjustments', { productId: product.id, quantity: 6, reason: 'count_correction' }), 201)

    expect(await shortageOf(product.id)).toBeUndefined()
  })

  it('drops a Product once a Purchase covers it', async () => {
    const product = await createProduct('Bolsa camiseta')
    const customer = await createCustomer('Kiosco Compra', 'Laborde')
    await createOrder(customer, '2026-11-24', [{ productId: product.id, quantity: 10 }])
    const supplier = await ok(await post('/suppliers', { name: 'Papelera Sur' }), 201)
    await ok(await post('/purchases', { supplierId: supplier.id, lines: [{ productId: product.id, quantity: 8, unitCost: '1.00' }] }), 201)
    expect(await shortageOf(product.id)).toMatchObject({ shortfall: 2 })

    await ok(await post('/purchases', { supplierId: supplier.id, lines: [{ productId: product.id, quantity: 2, unitCost: '1.00' }] }), 201)

    expect(await shortageOf(product.id)).toBeUndefined()
  })

  it('stops counting an Order once it is cancelled or delivered', async () => {
    const product = await createProduct('Rollo cocina')
    await setOnHand(product.id, 3)
    const customer = await createCustomer('Kiosco Entregas', 'Laborde')
    const cancelled = await createOrder(customer, '2026-11-24', [{ productId: product.id, quantity: 4 }])
    const delivered = await createOrder(customer, '2026-11-24', [{ productId: product.id, quantity: 2 }])
    expect(await shortageOf(product.id)).toMatchObject({ shortfall: 3 })

    await ok(await post(`/orders/${cancelled.id}/cancel`, {}))
    expect(await shortageOf(product.id)).toBeUndefined()

    // Delivering takes the units out of On-hand stock and releases the reservation: 3 − 2 = 1.
    const third = await createOrder(customer, '2026-11-24', [{ productId: product.id, quantity: 2 }])
    expect((await shortageOf(product.id)).orders.map((o: { id: string }) => o.id)).toEqual([delivered.id, third.id])
    await ok(await post(`/orders/${delivered.id}/deliver`, {}))

    expect(await shortageOf(product.id)).toMatchObject({
      stock: { onHand: 1, reserved: 2, available: -1 },
      orders: [{ id: third.id, quantity: 2 }],
    })
  })

  it('never shows another business\'s Products or Orders', async () => {
    const other = await t.createOwnedBusiness('Otra distribuidora')
    const as = other.userId
    const foreign = await ok(await t.request('/products', { as, method: 'POST', body: JSON.stringify({ code: 'AJENO', name: 'Ajeno', price: '1.00' }) }), 201)
    const customer = await ok(await t.request('/customers', { as, method: 'POST', body: JSON.stringify({ name: 'Ajeno', branches: [{ address: 'X 1', city: 'Y' }] }) }), 201)
    await ok(await t.request('/orders', {
      as,
      method: 'POST',
      body: JSON.stringify({ customerId: customer.id, branchId: customer.branches[0].id, deliveryDate: '2026-11-24', lines: [{ productId: foreign.id, quantity: 9 }] }),
    }), 201)

    expect(await shortageOf(foreign.id)).toBeUndefined()
    const theirs = await ok(await t.request('/stock/shortages', { as }))
    expect(theirs.items.map((i: { product: { id: string } }) => i.product.id)).toEqual([foreign.id])
  })

  it('requires sign-in and a business the user belongs to', async () => {
    expect((await t.request('/stock/shortages')).status).toBe(401)

    const stranger = await t.createOwnedBusiness('Ajeno')
    expect((await t.request('/stock/shortages', { as: stranger.userId, businessId: owner.businessId })).status).toBe(403)

    const noBusiness = await t.createUser()
    expect((await t.request('/stock/shortages', { as: noBusiness })).status).toBe(403)
  })
})
