import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { setupTestApp } from './fixtures'

const t = setupTestApp()
afterAll(() => t.close())

let owner: { userId: string, businessId: string }
let codes = 0

function api(path: string, init: RequestInit = {}) {
  return t.request(path, { as: owner.userId, ...init })
}

function post(path: string, body?: unknown) {
  return api(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) })
}

async function created(res: Response) {
  expect(res.status).toBe(201)
  return res.json()
}

async function createProduct(body: Record<string, unknown> = {}) {
  return created(await post('/products', { code: `REM-${++codes}`, name: 'Producto', price: '100.00', ...body }))
}

async function createCustomer(body: Record<string, unknown> = {}) {
  return created(await post('/customers', {
    name: 'Kiosco Don Pepe',
    branches: [{ address: 'San Martín 123', city: 'Corral de Bustos' }],
    ...body,
  }))
}

/** A Pending Order for a new Customer, one unit of a new Product. */
async function pendingOrder() {
  const customer = await createCustomer()
  const product = await createProduct()
  return created(await post('/orders', {
    customerId: customer.id,
    branchId: customer.branches[0].id,
    deliveryDate: '2026-11-24',
    lines: [{ productId: product.id, quantity: 1 }],
  }))
}

function issue(orderId: string) {
  return post(`/orders/${orderId}/delivery-note`)
}

async function issued(orderId: string) {
  const res = await issue(orderId)
  expect(res.status).toBe(200)
  return res.json()
}

beforeAll(async () => {
  owner = await t.createOwnedBusiness('Distribuidora Remitos')
})

describe('issuing a Delivery note', () => {
  it('answers with everything printed on the Delivery note: business, Customer, Branch, lines with Discounts, totals', async () => {
    const customer = await createCustomer({
      name: 'Almacén La Esquina',
      legalName: 'La Esquina SRL',
      cuit: '30-71234567-1',
      vatCondition: 'responsable_inscripto',
      phone: '3468 123456',
      branches: [{ name: 'Local centro', address: 'Belgrano 456', city: 'Isla Verde', postalCode: '2661' }],
    })
    const servilleta = await createProduct({ name: 'Servilleta', price: '1250.50' })
    const vaso = await createProduct({ name: 'Vaso', price: '80.00' })
    const order = await created(await post('/orders', {
      customerId: customer.id,
      branchId: customer.branches[0].id,
      deliveryDate: '2026-11-24',
      discountPercent: '5.00',
      notes: 'Dejar en el depósito',
      lines: [
        { productId: vaso.id, quantity: 10, discountPercent: '10.00' },
        { productId: servilleta.id, quantity: 2 },
      ],
    }))

    const note = await issued(order.id)

    expect(note).toEqual({
      number: expect.any(Number),
      issuedAt: expect.any(String),
      business: { name: 'Distribuidora Remitos', cuit: null },
      customer: {
        id: customer.id,
        name: 'Almacén La Esquina',
        legalName: 'La Esquina SRL',
        cuit: '30-71234567-1',
        vatCondition: 'responsable_inscripto',
        phone: '3468 123456',
      },
      branch: {
        id: customer.branches[0].id,
        name: 'Local centro',
        address: 'Belgrano 456',
        city: 'Isla Verde',
        province: 'Córdoba',
        postalCode: '2661',
      },
      order: {
        id: order.id,
        number: order.number,
        status: 'pending',
        deliveryDate: '2026-11-24',
        deliveredOn: null,
        discountPercent: '5.00',
        notes: 'Dejar en el depósito',
      },
      lines: [
        { id: order.lines[0].id, product: { id: vaso.id, code: vaso.code, name: 'Vaso' }, quantity: 10, unitPrice: '80.00', discountPercent: '10.00', subtotal: '720.00' },
        { id: order.lines[1].id, product: { id: servilleta.id, code: servilleta.code, name: 'Servilleta' }, quantity: 2, unitPrice: '1250.50', discountPercent: '0.00', subtotal: '2501.00' },
      ],
      totals: { subtotal: '3221.00', discountAmount: '161.05', total: '3059.95' },
    })
    expect(new Date(note.issuedAt).toString()).not.toBe('Invalid Date')

    const detail = await (await api(`/orders/${order.id}`)).json()
    expect(detail.deliveryNoteNumber).toBe(note.number)
  })
})

describe('Delivery note numbers', () => {
  it('numbers Delivery notes in the order they are first issued, not by Order number', async () => {
    const first = await pendingOrder()
    const second = await pendingOrder()

    const b = await issued(second.id)
    const a = await issued(first.id)

    expect(a.number).toBe(b.number + 1)
  })

  it('keeps the same number and issue time when the Delivery note is printed again', async () => {
    const order = await pendingOrder()

    const first = await issued(order.id)
    const reprint = await issued(order.id)

    expect(reprint).toEqual(first)
  })

  it('never reuses a number, even after its Order is cancelled', async () => {
    const order = await pendingOrder()
    const note = await issued(order.id)
    expect((await post(`/orders/${order.id}/cancel`)).status).toBe(200)

    const afterCancel = await issued(order.id)
    const next = await issued((await pendingOrder()).id)

    expect(afterCancel).toMatchObject({ number: note.number, issuedAt: note.issuedAt, order: { status: 'cancelled' } })
    expect(next.number).toBe(note.number + 1)
  })

  it('gives Delivery notes issued at the same moment distinct, gapless numbers, and one number per Order', async () => {
    const orders = await Promise.all(Array.from({ length: 6 }, () => pendingOrder()))
    const latest = await issued((await pendingOrder()).id)

    // Every Order issued twice at once: one number per Order, no two Orders sharing one.
    const notes = await Promise.all([...orders, ...orders].map(o => issued(o.id)))

    const byOrder = new Map<string, Set<number>>()
    for (const note of notes) byOrder.set(note.order.id, (byOrder.get(note.order.id) ?? new Set()).add(note.number))
    expect([...byOrder.values()].map(numbers => numbers.size)).toEqual(Array(6).fill(1))
    const numbers = [...byOrder.values()].flatMap(numbers => [...numbers]).sort((x, y) => x - y)
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6].map(i => latest.number + i))
  })
})

describe('what a Delivery note refuses', () => {
  it('refuses a Delivery note for a Cancelled Order that never had one', async () => {
    const order = await pendingOrder()
    expect((await post(`/orders/${order.id}/cancel`)).status).toBe(200)

    const res = await issue(order.id)

    expect(res.status).toBe(409)
    expect((await res.json()).error.code).toBe('order_cancelled')
    const detail = await (await api(`/orders/${order.id}`)).json()
    expect(detail.deliveryNoteNumber).toBeNull()
  })

  it('does not find another business\'s Order', async () => {
    const other = await t.createOwnedBusiness('Distribuidora Ajena')
    const asOther = (path: string, body: unknown) =>
      t.request(path, { as: other.userId, method: 'POST', body: JSON.stringify(body) })
    const customer = await (await asOther('/customers', { name: 'Ajeno', branches: [{ address: 'Calle 1', city: 'Marcos Juárez' }] })).json()
    const product = await (await asOther('/products', { code: 'AJ-1', name: 'Ajeno', price: '1.00' })).json()
    const foreign = await (await asOther('/orders', {
      customerId: customer.id,
      branchId: customer.branches[0].id,
      deliveryDate: '2026-11-24',
      lines: [{ productId: product.id, quantity: 1 }],
    })).json()

    const res = await issue(foreign.id)

    expect(res.status).toBe(404)
    expect((await res.json()).error.code).toBe('order_not_found')
    const theirs = await t.request(`/orders/${foreign.id}/delivery-note`, { as: other.userId, method: 'POST' })
    expect((await theirs.json()).number).toBe(1)
  })
})
