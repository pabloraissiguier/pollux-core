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

function patch(path: string, body: unknown) {
  return api(path, { method: 'PATCH', body: JSON.stringify(body) })
}

async function createProduct(body: Record<string, unknown> = {}) {
  const res = await post('/products', { code: `PED-${++codes}`, name: 'Producto', price: '100.00', ...body })
  expect(res.status).toBe(201)
  return res.json()
}

async function getProduct(id: string) {
  const res = await api(`/products/${id}`)
  expect(res.status).toBe(200)
  return res.json()
}

async function setOnHand(productId: string, quantity: number) {
  const res = await post('/stock/initial-count', { items: [{ productId, quantity }] })
  expect(res.status).toBe(200)
}

async function createCustomer(name = 'Kiosco Don Pepe', city = 'Corral de Bustos') {
  const res = await post('/customers', {
    name,
    branches: [{ address: 'San Martín 123', city }, { address: 'Belgrano 456', city: 'Isla Verde' }],
  })
  expect(res.status).toBe(201)
  return res.json()
}

/** The Customer's Branch in a town. */
function branchIn(customer: { branches: { id: string, city: string }[] }, city: string) {
  return customer.branches.find(b => b.city === city)!
}

async function createOrder(body: Record<string, unknown>) {
  const res = await post('/orders', body)
  expect(res.status).toBe(201)
  return res.json()
}

beforeAll(async () => {
  owner = await t.createOwnedBusiness('Distribuidora Pedidos')
})

describe('creating an Order', () => {
  it('creates a Pending Order for a Customer and Branch, with lines that freeze the current Price', async () => {
    const customer = await createCustomer()
    const servilleta = await createProduct({ name: 'Servilleta', price: '1250.50' })
    const vaso = await createProduct({ name: 'Vaso', price: '80.00' })
    await setOnHand(servilleta.id, 50)
    await setOnHand(vaso.id, 50)

    const res = await post('/orders', {
      customerId: customer.id,
      branchId: branchIn(customer, 'Corral de Bustos').id,
      deliveryDate: '2026-11-23',
      notes: 'Pedido por teléfono',
      lines: [
        { productId: vaso.id, quantity: 10 },
        { productId: servilleta.id, quantity: 2 },
      ],
    })

    expect(res.status).toBe(201)
    const order = await res.json()
    expect(order).toMatchObject({
      number: expect.any(Number),
      status: 'pending',
      customer: { id: customer.id, name: 'Kiosco Don Pepe' },
      branch: { id: branchIn(customer, 'Corral de Bustos').id, address: 'San Martín 123', city: 'Corral de Bustos' },
      deliveryDate: '2026-11-23',
      deliveredOn: null,
      discountPercent: '0.00',
      notes: 'Pedido por teléfono',
      deliveryNoteNumber: null,
      lines: [
        { product: { id: vaso.id, name: 'Vaso' }, quantity: 10, unitPrice: '80.00', discountPercent: '0.00', subtotal: '800.00' },
        { product: { id: servilleta.id, name: 'Servilleta' }, quantity: 2, unitPrice: '1250.50', discountPercent: '0.00', subtotal: '2501.00' },
      ],
      totals: { subtotal: '3301.00', discountAmount: '0.00', total: '3301.00' },
      warnings: [],
    })

    const detail = await api(`/orders/${order.id}`)
    expect(detail.status).toBe(200)
    expect({ ...(await detail.json()), warnings: [] }).toEqual(order)
  })
})

/** Another business, with its own owner, Customer, Product and Pending Order. */
async function createForeignOrder() {
  const other = await t.createOwnedBusiness('Distribuidora Ajena')
  const asOther = (path: string, body: unknown) =>
    t.request(path, { as: other.userId, method: 'POST', body: JSON.stringify(body) })
  const customer = await (await asOther('/customers', { name: 'Ajeno', branches: [{ address: 'Calle 1', city: 'Marcos Juárez' }] })).json()
  const product = await (await asOther('/products', { code: 'AJ-1', name: 'Ajeno', price: '1.00' })).json()
  const res = await asOther('/orders', {
    customerId: customer.id,
    branchId: customer.branches[0].id,
    deliveryDate: '2026-11-24',
    lines: [{ productId: product.id, quantity: 1 }],
  })
  expect(res.status).toBe(201)
  return { customer, product, order: await res.json() }
}

/** A Pending Order for a new Customer, with one line per Product. */
async function orderFor(productIds: string[], extra: Record<string, unknown> = {}) {
  const customer = await createCustomer()
  return createOrder({
    customerId: customer.id,
    branchId: customer.branches[0].id,
    deliveryDate: '2026-11-24',
    lines: productIds.map(productId => ({ productId, quantity: 1 })),
    ...extra,
  })
}

describe('Order numbers', () => {
  it('numbers Orders in sequence within each business', async () => {
    const product = await createProduct()

    const first = await orderFor([product.id])
    const second = await orderFor([product.id])
    const foreign = await createForeignOrder()

    expect(second.number).toBe(first.number + 1)
    expect(foreign.order.number).toBe(1)
  })

  it('gives Orders created at the same moment distinct numbers', async () => {
    const customer = await createCustomer()
    const product = await createProduct()
    const body = { customerId: customer.id, branchId: customer.branches[0].id, deliveryDate: '2026-11-24', lines: [{ productId: product.id, quantity: 1 }] }

    const responses = await Promise.all(Array.from({ length: 8 }, () => post('/orders', body)))

    expect(responses.map(r => r.status)).toEqual(Array(8).fill(201))
    const numbers = await Promise.all(responses.map(async r => (await r.json()).number))
    expect(new Set(numbers).size).toBe(8)
    expect((await getProduct(product.id)).stock.reserved).toBe(8)
  })
})

describe('what an Order refuses', () => {
  it('refuses a Branch that belongs to another Customer', async () => {
    const customer = await createCustomer()
    const someoneElse = await createCustomer('Almacén La Esquina')
    const product = await createProduct()

    const res = await post('/orders', {
      customerId: customer.id,
      branchId: someoneElse.branches[0].id,
      deliveryDate: '2026-11-24',
      lines: [{ productId: product.id, quantity: 1 }],
    })

    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('branch_not_of_customer')
  })

  it('refuses Inactive Products', async () => {
    const product = await createProduct({ name: 'Bandeja discontinuada' })
    expect((await patch(`/products/${product.id}`, { isActive: false })).status).toBe(200)
    const customer = await createCustomer()

    const res = await post('/orders', {
      customerId: customer.id,
      branchId: customer.branches[0].id,
      deliveryDate: '2026-11-24',
      lines: [{ productId: product.id, quantity: 1 }],
    })

    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatchObject({ code: 'product_inactive', message: expect.stringContaining('Bandeja discontinuada') })
  })

  it('needs at least one line with a positive whole quantity, and a valid Delivery date', async () => {
    const customer = await createCustomer()
    const product = await createProduct()
    const base = { customerId: customer.id, branchId: customer.branches[0].id, deliveryDate: '2026-11-24' }

    const empty = await post('/orders', { ...base, lines: [] })
    expect(empty.status).toBe(400)
    expect((await empty.json()).error.details).toHaveProperty('lines')

    const zero = await post('/orders', { ...base, lines: [{ productId: product.id, quantity: 0 }] })
    expect(zero.status).toBe(400)
    expect((await zero.json()).error.details).toHaveProperty(['lines.0.quantity'])

    const badDate = await post('/orders', { ...base, deliveryDate: '24/11/2026', lines: [{ productId: product.id, quantity: 1 }] })
    expect(badDate.status).toBe(400)
    expect((await badDate.json()).error.details).toHaveProperty('deliveryDate')
  })

  it('treats another business\'s Customer, Product or Order as missing', async () => {
    const foreign = await createForeignOrder()
    const customer = await createCustomer()
    const product = await createProduct()

    const withForeignCustomer = await post('/orders', {
      customerId: foreign.customer.id,
      branchId: foreign.customer.branches[0].id,
      deliveryDate: '2026-11-24',
      lines: [{ productId: product.id, quantity: 1 }],
    })
    expect(withForeignCustomer.status).toBe(404)
    expect((await withForeignCustomer.json()).error.code).toBe('customer_not_found')

    const withForeignProduct = await post('/orders', {
      customerId: customer.id,
      branchId: customer.branches[0].id,
      deliveryDate: '2026-11-24',
      lines: [{ productId: foreign.product.id, quantity: 1 }],
    })
    expect(withForeignProduct.status).toBe(404)
    expect((await withForeignProduct.json()).error.code).toBe('product_not_found')

    for (const res of [
      await api(`/orders/${foreign.order.id}`),
      await patch(`/orders/${foreign.order.id}`, { notes: 'x' }),
      await post(`/orders/${foreign.order.id}/cancel`, {}),
    ]) {
      expect(res.status).toBe(404)
      expect((await res.json()).error.code).toBe('order_not_found')
    }
    const list = await (await api('/orders?limit=200')).json()
    expect(list.items.map((o: { id: string }) => o.id)).not.toContain(foreign.order.id)
  })
})

describe('Order totals', () => {
  it('rounds each line subtotal to cents, then takes the Order Discount from the subtotal', async () => {
    const vaso = await createProduct({ price: '333.33' })
    const sorbete = await createProduct({ price: '0.15' })
    const customer = await createCustomer()

    const order = await createOrder({
      customerId: customer.id,
      branchId: customer.branches[0].id,
      deliveryDate: '2026-11-24',
      discountPercent: '10',
      lines: [
        // 3 × 333.33 = 999.99, minus 15% = 849.9915 → 849.99
        { productId: vaso.id, quantity: 3, discountPercent: '15' },
        // 0.15 minus 50% = 0.075 → 0.08
        { productId: sorbete.id, quantity: 1, discountPercent: '50.00' },
      ],
    })

    expect(order.discountPercent).toBe('10.00')
    expect(order.lines.map((l: { discountPercent: string, subtotal: string }) => [l.discountPercent, l.subtotal]))
      .toEqual([['15.00', '849.99'], ['50.00', '0.08']])
    // Subtotal 850.07; 10% is 85.007 → 85.01; total 765.06.
    expect(order.totals).toEqual({ subtotal: '850.07', discountAmount: '85.01', total: '765.06' })
    expect((await (await api(`/orders/${order.id}`)).json()).totals).toEqual(order.totals)
  })

  it('refuses a Discount outside 0 to 100', async () => {
    const product = await createProduct()
    const customer = await createCustomer()
    const base = { customerId: customer.id, branchId: customer.branches[0].id, deliveryDate: '2026-11-24' }

    const lineOver = await post('/orders', { ...base, lines: [{ productId: product.id, quantity: 1, discountPercent: '100.01' }] })
    expect(lineOver.status).toBe(400)
    expect((await lineOver.json()).error.details).toHaveProperty(['lines.0.discountPercent'])

    const orderNegative = await post('/orders', { ...base, discountPercent: '-5', lines: [{ productId: product.id, quantity: 1 }] })
    expect(orderNegative.status).toBe(400)
    expect((await orderNegative.json()).error.details).toHaveProperty('discountPercent')
  })
})

describe('the negative-stock warning', () => {
  it('warns about each line that leaves Available stock negative, and still takes the Order', async () => {
    const short = await createProduct({ name: 'Bolsa camiseta' })
    const plenty = await createProduct({ name: 'Rollo de cocina' })
    await setOnHand(short.id, 5)
    await setOnHand(plenty.id, 100)
    const customer = await createCustomer()

    const res = await post('/orders', {
      customerId: customer.id,
      branchId: customer.branches[0].id,
      deliveryDate: '2026-11-24',
      lines: [{ productId: plenty.id, quantity: 10 }, { productId: short.id, quantity: 8 }],
    })

    expect(res.status).toBe(201)
    const order = await res.json()
    expect(order.warnings).toEqual([{
      code: 'stock_negative',
      lineId: order.lines[1].id,
      product: { id: short.id, code: short.code, name: 'Bolsa camiseta' },
      available: -3,
    }])
    expect((await getProduct(short.id)).stock).toEqual({ onHand: 5, reserved: 8, available: -3 })
  })
})

describe('frozen prices', () => {
  it('keeps the Price a line was taken at when the Product\'s Price changes later', async () => {
    const product = await createProduct({ price: '500.00' })
    const order = await orderFor([product.id])

    expect((await patch(`/products/${product.id}`, { price: '650.00' })).status).toBe(200)

    const detail = await (await api(`/orders/${order.id}`)).json()
    expect(detail.lines[0].unitPrice).toBe('500.00')
    expect(detail.totals.total).toBe('500.00')
  })

  it('keeps the frozen price on kept lines when editing, and gives new lines the current Price', async () => {
    const product = await createProduct({ price: '500.00' })
    const other = await createProduct({ price: '20.00' })
    const order = await orderFor([product.id])
    await patch(`/products/${product.id}`, { price: '650.00' })
    await patch(`/products/${other.id}`, { price: '25.00' })

    const res = await patch(`/orders/${order.id}`, {
      lines: [
        { id: order.lines[0].id, productId: product.id, quantity: 2 },
        { productId: product.id, quantity: 1 },
        { productId: other.id, quantity: 4 },
      ],
    })

    expect(res.status).toBe(200)
    const edited = await res.json()
    expect(edited.lines.map((l: { id: string, unitPrice: string, quantity: number }) => [l.id === order.lines[0].id, l.unitPrice, l.quantity]))
      .toEqual([[true, '500.00', 2], [false, '650.00', 1], [false, '25.00', 4]])
    // 2 × 500 + 650 + 4 × 25
    expect(edited.totals.total).toBe('1750.00')
  })
})

describe('editing a Pending Order', () => {
  it('changes the Branch, Delivery date, Discounts and notes, keeping what isn\'t sent', async () => {
    const product = await createProduct({ price: '100.00' })
    const customer = await createCustomer()
    const order = await createOrder({
      customerId: customer.id,
      branchId: branchIn(customer, 'Corral de Bustos').id,
      deliveryDate: '2026-11-24',
      notes: 'Dejar en el depósito',
      lines: [{ productId: product.id, quantity: 4 }],
    })

    const res = await patch(`/orders/${order.id}`, {
      branchId: branchIn(customer, 'Isla Verde').id,
      deliveryDate: '2026-11-25',
      discountPercent: '5',
    })

    expect(res.status).toBe(200)
    const edited = await res.json()
    expect(edited).toMatchObject({
      number: order.number,
      branch: { city: 'Isla Verde' },
      deliveryDate: '2026-11-25',
      discountPercent: '5.00',
      notes: 'Dejar en el depósito',
      lines: [{ id: order.lines[0].id, quantity: 4 }],
      totals: { subtotal: '400.00', discountAmount: '20.00', total: '380.00' },
    })

    const cleared = await (await patch(`/orders/${order.id}`, { notes: '' })).json()
    expect(cleared.notes).toBeNull()
  })

  it('takes the full line list: changes kept lines, removes the ones left out and keeps their order', async () => {
    const a = await createProduct({ price: '10.00' })
    const b = await createProduct({ price: '20.00' })
    const c = await createProduct({ price: '30.00' })
    const order = await orderFor([a.id, b.id, c.id])
    const [lineA, , lineC] = order.lines

    const edited = await (await patch(`/orders/${order.id}`, {
      lines: [
        { id: lineC.id, productId: c.id, quantity: 3, discountPercent: '10' },
        { id: lineA.id, productId: a.id, quantity: 1 },
      ],
    })).json()

    expect(edited.lines.map((l: { id: string, quantity: number, subtotal: string }) => [l.id, l.quantity, l.subtotal]))
      .toEqual([[lineC.id, 3, '81.00'], [lineA.id, 1, '10.00']])
    expect((await (await api(`/orders/${order.id}`)).json()).lines).toEqual(edited.lines)
  })

  it('refuses to change the Customer, to change a kept line\'s Product, or a line from another Order', async () => {
    const a = await createProduct()
    const b = await createProduct()
    const order = await orderFor([a.id])
    const another = await orderFor([a.id])
    const newCustomer = await createCustomer('Otro cliente')

    const customerChange = await patch(`/orders/${order.id}`, { customerId: newCustomer.id })
    expect(customerChange.status).toBe(400)
    expect((await customerChange.json()).error.details).toHaveProperty('customerId')

    const productChange = await patch(`/orders/${order.id}`, { lines: [{ id: order.lines[0].id, productId: b.id, quantity: 1 }] })
    expect(productChange.status).toBe(400)
    expect((await productChange.json()).error.code).toBe('order_line_product_changed')

    const foreignLine = await patch(`/orders/${order.id}`, { lines: [{ id: another.lines[0].id, productId: a.id, quantity: 1 }] })
    expect(foreignLine.status).toBe(404)
    expect((await foreignLine.json()).error.code).toBe('order_line_not_found')

    const otherBranch = await patch(`/orders/${order.id}`, { branchId: newCustomer.branches[0].id })
    expect(otherBranch.status).toBe(400)
    expect((await otherBranch.json()).error.code).toBe('branch_not_of_customer')

    expect((await (await api(`/orders/${order.id}`)).json()).lines).toEqual(order.lines)
  })

  it('refuses new lines with Inactive Products, but keeps lines already taken for them', async () => {
    const product = await createProduct()
    const retired = await createProduct({ name: 'Producto retirado' })
    const order = await orderFor([product.id, retired.id])
    await patch(`/products/${retired.id}`, { isActive: false })

    const kept = await patch(`/orders/${order.id}`, {
      lines: [
        { id: order.lines[0].id, productId: product.id, quantity: 2 },
        { id: order.lines[1].id, productId: retired.id, quantity: 1 },
      ],
    })
    expect(kept.status).toBe(200)

    const added = await patch(`/orders/${order.id}`, { lines: [{ productId: retired.id, quantity: 1 }] })
    expect(added.status).toBe(409)
    expect((await added.json()).error.code).toBe('product_inactive')
  })
})

describe('cancelling an Order', () => {
  it('cancels a Pending Order, and then refuses to edit or cancel it again', async () => {
    const product = await createProduct()
    const order = await orderFor([product.id])

    const res = await post(`/orders/${order.id}/cancel`, {})
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ id: order.id, status: 'cancelled', cancelledAt: expect.any(String) })

    for (const again of [
      await patch(`/orders/${order.id}`, { notes: 'tarde' }),
      await post(`/orders/${order.id}/cancel`, {}),
    ]) {
      expect(again.status).toBe(409)
      expect((await again.json()).error.code).toBe('order_not_pending')
    }
  })
})

describe('Reserved and Available stock', () => {
  it('follow Pending Orders across create, edit and cancel', async () => {
    const product = await createProduct()
    await setOnHand(product.id, 20)

    const order = await orderFor([product.id], { lines: [{ productId: product.id, quantity: 6 }] })
    expect((await getProduct(product.id)).stock).toEqual({ onHand: 20, reserved: 6, available: 14 })

    await patch(`/orders/${order.id}`, { lines: [{ id: order.lines[0].id, productId: product.id, quantity: 9 }] })
    expect((await getProduct(product.id)).stock).toEqual({ onHand: 20, reserved: 9, available: 11 })

    const second = await orderFor([product.id], { lines: [{ productId: product.id, quantity: 15 }] })
    expect(second.warnings).toEqual([expect.objectContaining({ available: -4 })])

    await post(`/orders/${order.id}/cancel`, {})
    expect((await getProduct(product.id)).stock).toEqual({ onHand: 20, reserved: 15, available: 5 })

    const edited = await (await patch(`/orders/${second.id}`, { lines: [{ productId: product.id, quantity: 25 }] })).json()
    expect(edited.warnings).toEqual([expect.objectContaining({ available: -5 })])
    expect((await getProduct(product.id)).stock).toEqual({ onHand: 20, reserved: 25, available: -5 })
  })
})

describe('listing Orders', () => {
  it('filters by status, Delivery date, town and Customer, with totals', async () => {
    const { userId } = await t.createOwnedBusiness('Distribuidora Listado')
    const as = (path: string, init: RequestInit = {}) => t.request(path, { as: userId, ...init })
    const send = async (path: string, body: unknown) => (await as(path, { method: 'POST', body: JSON.stringify(body) })).json()
    const product = await send('/products', { code: 'L-1', name: 'Vaso', price: '10.00' })
    const pepe = await send('/customers', { name: 'Pepe', branches: [{ address: 'A 1', city: 'Corral de Bustos' }] })
    const lola = await send('/customers', { name: 'Lola', branches: [{ address: 'B 2', city: 'Isla Verde' }] })
    const order = (customer: { id: string, branches: [{ id: string }] }, deliveryDate: string, quantity: number) =>
      send('/orders', { customerId: customer.id, branchId: customer.branches[0].id, deliveryDate, lines: [{ productId: product.id, quantity }] })
    const pepeTomorrow = await order(pepe, '2026-11-24', 1)
    const lolaTomorrow = await order(lola, '2026-11-24', 2)
    const pepeLater = await order(pepe, '2026-11-25', 3)
    const cancelled = await order(lola, '2026-11-24', 4)
    await as(`/orders/${cancelled.id}/cancel`, { method: 'POST' })
    const list = async (query: string) => {
      const res = await as(`/orders?${query}`)
      expect(res.status).toBe(200)
      const body = await res.json()
      return { numbers: body.items.map((o: { number: number }) => o.number), total: body.total, items: body.items }
    }

    const all = await list('')
    expect(all.numbers).toEqual([pepeLater.number, pepeTomorrow.number, lolaTomorrow.number, cancelled.number])
    expect(all.total).toBe(4)
    expect(all.items[0]).toMatchObject({
      customer: { id: pepe.id, name: 'Pepe' },
      branch: { city: 'Corral de Bustos' },
      status: 'pending',
      totals: { subtotal: '30.00', discountAmount: '0.00', total: '30.00' },
    })

    expect((await list('status=pending&deliveryDate=2026-11-24')).numbers).toEqual([pepeTomorrow.number, lolaTomorrow.number])
    expect((await list('town=isla%20verde')).numbers).toEqual([lolaTomorrow.number, cancelled.number])
    expect((await list(`customerId=${pepe.id}`)).numbers).toEqual([pepeLater.number, pepeTomorrow.number])
    expect((await list('status=cancelled')).numbers).toEqual([cancelled.number])
    const page = await list('limit=1&offset=1')
    expect(page).toMatchObject({ numbers: [pepeTomorrow.number], total: 4 })
    // A later page carries its own Orders' lines, not the first page's.
    expect(page.items[0].lines).toMatchObject([{ product: { id: product.id }, quantity: 1 }])
    expect(page.items[0].totals.total).toBe('10.00')

    const invalid = await as('/orders?status=borrador&deliveryDate=mañana')
    expect(invalid.status).toBe(400)
    expect(Object.keys((await invalid.json()).error.details)).toEqual(expect.arrayContaining(['status', 'deliveryDate']))
  })
})
