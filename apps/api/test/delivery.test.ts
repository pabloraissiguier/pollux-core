import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { setupTestApp } from './fixtures'

const t = setupTestApp()
afterAll(() => t.close())

let owner: { userId: string, businessId: string }
let codes = 0

function api(path: string, init: RequestInit = {}) {
  return t.request(path, { as: owner.userId, ...init })
}

function post(path: string, body: unknown = {}) {
  return api(path, { method: 'POST', body: JSON.stringify(body) })
}

async function createProduct(price: string, onHand: number) {
  const res = await post('/products', { code: `ENT-${++codes}`, name: `Producto ${codes}`, price })
  expect(res.status).toBe(201)
  const product = await res.json()
  const count = await post('/stock/initial-count', { items: [{ productId: product.id, quantity: onHand }] })
  expect(count.status).toBe(200)
  return product as { id: string }
}

async function onHandOf(productId: string): Promise<number> {
  const res = await api(`/products/${productId}`)
  expect(res.status).toBe(200)
  return (await res.json()).stock.onHand
}

async function createCustomer(name = 'Almacén La Esquina') {
  const res = await post('/customers', { name, branches: [{ address: 'Mitre 10', city: 'Corral de Bustos' }] })
  expect(res.status).toBe(201)
  return (await res.json()) as { id: string, branches: { id: string }[] }
}

async function createOrder(
  customer: { id: string, branches: { id: string }[] },
  lines: { productId: string, quantity: number, discountPercent?: string }[],
  extra: Record<string, unknown> = {},
) {
  const res = await post('/orders', {
    customerId: customer.id,
    branchId: customer.branches[0]!.id,
    deliveryDate: '2026-11-20',
    lines,
    ...extra,
  })
  expect(res.status).toBe(201)
  return (await res.json()) as { id: string, number: number, totals: { total: string } }
}

beforeAll(async () => {
  owner = await t.createOwnedBusiness('Distribuidora Entregas')
})

describe('delivering an Order', () => {
  it('takes the stock out, debits the Customer for the Order total and marks it Delivered on the given date', async () => {
    const customer = await createCustomer()
    const servilleta = await createProduct('1250.50', 20)
    const vaso = await createProduct('80.00', 100)
    const order = await createOrder(customer, [
      { productId: servilleta.id, quantity: 2 },
      { productId: vaso.id, quantity: 10, discountPercent: '10' },
    ], { discountPercent: '5' })
    // (2 × 1250.50) + (10 × 80 × 0.9) = 2501.00 + 720.00 = 3221.00; − 5% (161.05) = 3059.95
    expect(order.totals.total).toBe('3059.95')

    const res = await post(`/orders/${order.id}/deliver`, { deliveredOn: '2026-11-21' })

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ id: order.id, status: 'delivered', deliveredOn: '2026-11-21' })
    expect(await onHandOf(servilleta.id)).toBe(18)
    expect(await onHandOf(vaso.id)).toBe(90)

    const balance = await api(`/customers/${customer.id}/balance`)
    expect(balance.status).toBe(200)
    expect(await balance.json()).toEqual({ customer: { id: customer.id, name: 'Almacén La Esquina' }, balance: '3059.95' })
  })

  it('records the stock leaving as order_delivered Stock movements that name the Order', async () => {
    const customer = await createCustomer()
    const product = await createProduct('100.00', 10)
    const order = await createOrder(customer, [{ productId: product.id, quantity: 4 }])

    await post(`/orders/${order.id}/deliver`, { deliveredOn: '2026-11-21' })

    const res = await api(`/stock/movements?productId=${product.id}`)
    const { items } = await res.json()
    expect(items[0]).toMatchObject({ type: 'order_delivered', quantity: -4, order: { id: order.id, number: order.number } })
  })

  it('dates the delivery today in Córdoba when no Delivered date is given', async () => {
    const customer = await createCustomer()
    const product = await createProduct('100.00', 10)
    const order = await createOrder(customer, [{ productId: product.id, quantity: 1 }])
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Cordoba' }).format(new Date())

    const res = await post(`/orders/${order.id}/deliver`)

    expect(res.status).toBe(200)
    expect((await res.json()).deliveredOn).toBe(today)
  })

  it('refuses to deliver an Order that is not Pending', async () => {
    const customer = await createCustomer()
    const product = await createProduct('100.00', 10)
    const delivered = await createOrder(customer, [{ productId: product.id, quantity: 1 }])
    await post(`/orders/${delivered.id}/deliver`)
    const cancelled = await createOrder(customer, [{ productId: product.id, quantity: 1 }])
    await post(`/orders/${cancelled.id}/cancel`)

    for (const order of [delivered, cancelled]) {
      const res = await post(`/orders/${order.id}/deliver`)
      expect(res.status).toBe(409)
      expect((await res.json()).error.code).toBe('order_not_pending')
    }
    expect(await onHandOf(product.id)).toBe(9)
  })

  it('refuses an invalid Delivered date', async () => {
    const customer = await createCustomer()
    const product = await createProduct('100.00', 10)
    const order = await createOrder(customer, [{ productId: product.id, quantity: 1 }])

    const res = await post(`/orders/${order.id}/deliver`, { deliveredOn: '21/11/2026' })

    expect(res.status).toBe(400)
    expect((await res.json()).error.details).toHaveProperty('deliveredOn')
  })
})

async function balanceOf(customerId: string): Promise<string> {
  const res = await api(`/customers/${customerId}/balance`)
  expect(res.status).toBe(200)
  return (await res.json()).balance
}

async function statementOf(customerId: string, query = '') {
  const res = await api(`/customers/${customerId}/statement${query}`)
  expect(res.status).toBe(200)
  return res.json()
}

describe('undoing a delivery', () => {
  it('returns the stock, credits exactly what was debited and puts the Order back to Pending', async () => {
    const customer = await createCustomer()
    const product = await createProduct('333.33', 10)
    const order = await createOrder(customer, [{ productId: product.id, quantity: 3, discountPercent: '7.5' }])
    // 3 × 333.33 = 999.99 × 0.925 = 924.990… → 924.99
    expect(order.totals.total).toBe('924.99')
    await post(`/orders/${order.id}/deliver`, { deliveredOn: '2026-11-21' })

    const res = await post(`/orders/${order.id}/undo-delivery`)

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ id: order.id, status: 'pending', deliveredOn: null })
    expect(await onHandOf(product.id)).toBe(10)
    expect(await balanceOf(customer.id)).toBe('0.00')

    // Nothing is deleted: the debit and its reversal are both on the statement.
    const { items } = await statementOf(customer.id)
    expect(items.map((e: { type: string, amount: string }) => [e.type, e.amount])).toEqual([
      ['order_delivered', '924.99'],
      ['delivery_undone', '-924.99'],
    ])
    const movements = await (await api(`/stock/movements?productId=${product.id}`)).json()
    expect(movements.items.slice(0, 2).map((m: { type: string, quantity: number }) => [m.type, m.quantity])).toEqual([
      ['delivery_undone', 3],
      ['order_delivered', -3],
    ])
  })

  it('a fully discounted Order takes its stock out but charges nothing, and undoes cleanly', async () => {
    const customer = await createCustomer()
    const product = await createProduct('100.00', 10)
    const order = await createOrder(customer, [{ productId: product.id, quantity: 2 }], { discountPercent: '100' })
    expect(order.totals.total).toBe('0.00')

    const delivered = await post(`/orders/${order.id}/deliver`)
    expect(delivered.status).toBe(200)
    expect(await onHandOf(product.id)).toBe(8)
    expect(await statementOf(customer.id)).toEqual({ items: [], total: 0 })

    const undone = await post(`/orders/${order.id}/undo-delivery`)
    expect(undone.status).toBe(200)
    expect(await onHandOf(product.id)).toBe(10)
    expect(await balanceOf(customer.id)).toBe('0.00')
  })

  it('refuses to undo an Order that is not Delivered', async () => {
    const customer = await createCustomer()
    const product = await createProduct('100.00', 10)
    const order = await createOrder(customer, [{ productId: product.id, quantity: 1 }])

    const res = await post(`/orders/${order.id}/undo-delivery`)

    expect(res.status).toBe(409)
    expect((await res.json()).error.code).toBe('order_not_delivered')
    expect(await onHandOf(product.id)).toBe(10)
  })

  it('delivering, undoing and delivering again (after an edit) leaves stock and Balance consistent', async () => {
    const customer = await createCustomer()
    const product = await createProduct('50.00', 20)
    const order = await createOrder(customer, [{ productId: product.id, quantity: 4 }])

    await post(`/orders/${order.id}/deliver`, { deliveredOn: '2026-11-21' })
    await post(`/orders/${order.id}/undo-delivery`)
    // What actually went out was 6, not 4: fix the Pending Order, then deliver it again.
    const lineId = (await (await api(`/orders/${order.id}`)).json()).lines[0].id
    const edit = await api(`/orders/${order.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ lines: [{ id: lineId, productId: product.id, quantity: 6 }] }),
    })
    expect(edit.status).toBe(200)
    const again = await post(`/orders/${order.id}/deliver`, { deliveredOn: '2026-11-22' })

    expect(again.status).toBe(200)
    expect(await again.json()).toMatchObject({ status: 'delivered', deliveredOn: '2026-11-22' })
    expect(await onHandOf(product.id)).toBe(14)
    expect(await balanceOf(customer.id)).toBe('300.00')

    // A second undo reverses the second debit only.
    await post(`/orders/${order.id}/undo-delivery`)
    expect(await onHandOf(product.id)).toBe(20)
    expect(await balanceOf(customer.id)).toBe('0.00')
  })
})

describe('changing a Delivered Order', () => {
  it('editing it is refused until its delivery is undone', async () => {
    const customer = await createCustomer()
    const product = await createProduct('100.00', 10)
    const order = await createOrder(customer, [{ productId: product.id, quantity: 2 }])
    await post(`/orders/${order.id}/deliver`)

    const refused = await api(`/orders/${order.id}`, { method: 'PATCH', body: JSON.stringify({ notes: 'Corrección' }) })

    expect(refused.status).toBe(409)
    expect((await refused.json()).error.code).toBe('order_not_pending')

    await post(`/orders/${order.id}/undo-delivery`)
    const edited = await api(`/orders/${order.id}`, { method: 'PATCH', body: JSON.stringify({ notes: 'Corrección' }) })
    expect(edited.status).toBe(200)
  })

  it('cancelling it is refused until its delivery is undone', async () => {
    const customer = await createCustomer()
    const product = await createProduct('100.00', 10)
    const order = await createOrder(customer, [{ productId: product.id, quantity: 2 }])
    await post(`/orders/${order.id}/deliver`)

    const refused = await post(`/orders/${order.id}/cancel`)

    expect(refused.status).toBe(409)
    expect((await refused.json()).error.code).toBe('order_not_pending')
    expect(await onHandOf(product.id)).toBe(8)
    expect(await balanceOf(customer.id)).toBe('200.00')

    await post(`/orders/${order.id}/undo-delivery`)
    const cancelled = await post(`/orders/${order.id}/cancel`)
    expect(cancelled.status).toBe(200)
    expect(await onHandOf(product.id)).toBe(10)
    expect(await balanceOf(customer.id)).toBe('0.00')
  })
})

describe('a Customer\'s Balance and statement', () => {
  it('is zero for a Customer with no Balance entries', async () => {
    const customer = await createCustomer()

    expect(await balanceOf(customer.id)).toBe('0.00')
    expect(await statementOf(customer.id)).toEqual({ items: [], total: 0 })
  })

  it('lists Balance entries in date order with a running Balance, whatever order they were recorded in', async () => {
    const customer = await createCustomer()
    const product = await createProduct('100.00', 50)
    const late = await createOrder(customer, [{ productId: product.id, quantity: 3 }])
    const early = await createOrder(customer, [{ productId: product.id, quantity: 1 }])
    const middle = await createOrder(customer, [{ productId: product.id, quantity: 2 }])
    await post(`/orders/${late.id}/deliver`, { deliveredOn: '2026-11-15' })
    await post(`/orders/${early.id}/deliver`, { deliveredOn: '2026-11-01' })
    await post(`/orders/${middle.id}/deliver`, { deliveredOn: '2026-11-10' })

    const statement = await statementOf(customer.id)

    expect(statement.total).toBe(3)
    expect(statement.items).toEqual([
      expect.objectContaining({ type: 'order_delivered', entryDate: '2026-11-01', amount: '100.00', balance: '100.00', order: { id: early.id, number: early.number }, payment: null }),
      expect.objectContaining({ type: 'order_delivered', entryDate: '2026-11-10', amount: '200.00', balance: '300.00', order: { id: middle.id, number: middle.number } }),
      expect.objectContaining({ type: 'order_delivered', entryDate: '2026-11-15', amount: '300.00', balance: '600.00', order: { id: late.id, number: late.number } }),
    ])
    expect(await balanceOf(customer.id)).toBe('600.00')
  })

  it('filters by date range, keeping the running Balance from every earlier entry', async () => {
    const customer = await createCustomer()
    const product = await createProduct('100.00', 50)
    for (const [day, quantity] of [['2026-10-31', 1], ['2026-11-05', 2], ['2026-11-20', 4], ['2026-12-01', 8]] as const) {
      const order = await createOrder(customer, [{ productId: product.id, quantity }])
      await post(`/orders/${order.id}/deliver`, { deliveredOn: day })
    }

    const november = await statementOf(customer.id, '?from=2026-11-01&to=2026-11-30')

    expect(november.total).toBe(2)
    expect(november.items.map((e: { entryDate: string, balance: string }) => [e.entryDate, e.balance])).toEqual([
      ['2026-11-05', '300.00'],
      ['2026-11-20', '700.00'],
    ])
    const fromOnly = await statementOf(customer.id, '?from=2026-11-20')
    expect(fromOnly.items.map((e: { entryDate: string }) => e.entryDate)).toEqual(['2026-11-20', '2026-12-01'])
    const page = await statementOf(customer.id, '?limit=1&offset=1')
    expect(page).toMatchObject({ total: 4, items: [{ entryDate: '2026-11-05', balance: '300.00' }] })
  })

  it('refuses a date range that ends before it starts', async () => {
    const customer = await createCustomer()

    const res = await api(`/customers/${customer.id}/statement?from=2026-11-30&to=2026-11-01`)

    expect(res.status).toBe(400)
    expect((await res.json()).error.details).toHaveProperty('to')
  })
})

describe('tenant isolation', () => {
  it('another business\'s Order and Customer are not found', async () => {
    const customer = await createCustomer()
    const product = await createProduct('100.00', 10)
    const order = await createOrder(customer, [{ productId: product.id, quantity: 1 }])
    const other = await t.createOwnedBusiness('Otra distribuidora')

    for (const [path, method] of [
      [`/orders/${order.id}/deliver`, 'POST'],
      [`/orders/${order.id}/undo-delivery`, 'POST'],
      [`/customers/${customer.id}/balance`, 'GET'],
      [`/customers/${customer.id}/statement`, 'GET'],
    ] as const) {
      const res = await t.request(path, { as: other.userId, method, body: method === 'POST' ? '{}' : undefined })
      expect(res.status, path).toBe(404)
    }
    expect(await onHandOf(product.id)).toBe(10)
  })
})

describe('concurrent deliveries', () => {
  it('Orders for the same Product delivered at once all take their stock out', async () => {
    const customer = await createCustomer()
    const product = await createProduct('10.00', 100)
    const orders = await Promise.all([3, 5, 7, 11].map(quantity => createOrder(customer, [{ productId: product.id, quantity }])))

    const results = await Promise.all(orders.map(o => post(`/orders/${o.id}/deliver`, { deliveredOn: '2026-11-21' })))

    expect(results.map(r => r.status)).toEqual([200, 200, 200, 200])
    expect(await onHandOf(product.id)).toBe(100 - 26)
    expect(await balanceOf(customer.id)).toBe('260.00')
    const { items } = await (await api(`/stock/movements?productId=${product.id}`)).json()
    expect(items.filter((m: { type: string }) => m.type === 'order_delivered')).toHaveLength(4)
  })
})
