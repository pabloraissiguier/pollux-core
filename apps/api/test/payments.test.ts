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
  const res = await post('/products', { code: `PAG-${++codes}`, name: `Producto ${codes}`, price })
  expect(res.status).toBe(201)
  const product = await res.json()
  const count = await post('/stock/initial-count', { items: [{ productId: product.id, quantity: onHand }] })
  expect(count.status).toBe(200)
  return product as { id: string }
}

async function createCustomer(name = 'Kiosco El Sol') {
  const res = await post('/customers', { name, branches: [{ address: 'San Martín 50', city: 'Corral de Bustos' }] })
  expect(res.status).toBe(201)
  return (await res.json()) as { id: string, branches: { id: string }[] }
}

async function createOrder(customer: { id: string, branches: { id: string }[] }, price = '1000.00', quantity = 1) {
  const product = await createProduct(price, 100)
  const res = await post('/orders', {
    customerId: customer.id,
    branchId: customer.branches[0]!.id,
    deliveryDate: '2026-11-20',
    lines: [{ productId: product.id, quantity }],
  })
  expect(res.status).toBe(201)
  return (await res.json()) as { id: string, number: number, totals: { total: string } }
}

async function balanceOf(customerId: string): Promise<string> {
  const res = await api(`/customers/${customerId}/balance`)
  expect(res.status).toBe(200)
  return (await res.json()).balance
}

async function statementOf(customerId: string) {
  const res = await api(`/customers/${customerId}/statement`)
  expect(res.status).toBe(200)
  return (await res.json()).items as { type: string, amount: string, balance: string, entryDate: string, payment: { id: string, method: string } | null }[]
}

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Cordoba' }).format(new Date())

beforeAll(async () => {
  owner = await t.createOwnedBusiness('Distribuidora Pagos')
})

describe('recording a Payment', () => {
  it('lowers the Customer\'s Balance with a payment credit and answers with the Payment', async () => {
    const customer = await createCustomer()
    const order = await createOrder(customer, '1500.00')
    await post(`/orders/${order.id}/deliver`, { deliveredOn: '2026-11-20' })

    const res = await post('/payments', {
      customerId: customer.id,
      amount: '600.5',
      method: 'bank_transfer',
      paidOn: '2026-11-21',
      reference: 'Transferencia 0042',
    })

    expect(res.status).toBe(201)
    const payment = await res.json()
    expect(payment).toMatchObject({
      customer: { id: customer.id, name: 'Kiosco El Sol' },
      order: null,
      amount: '600.50',
      method: 'bank_transfer',
      paidOn: '2026-11-21',
      reference: 'Transferencia 0042',
      voidedAt: null,
      voidReason: null,
    })
    expect(await balanceOf(customer.id)).toBe('899.50')
    expect(await statementOf(customer.id)).toMatchObject([
      { type: 'order_delivered', amount: '1500.00', balance: '1500.00' },
      { type: 'payment', amount: '-600.50', balance: '899.50', entryDate: '2026-11-21', payment: { id: payment.id, method: 'bank_transfer' } },
    ])
  })

  it('dates the Payment today in Córdoba when no date is given, and a Customer with no debt is left with credit', async () => {
    const customer = await createCustomer()

    const res = await post('/payments', { customerId: customer.id, amount: '200', method: 'cash' })

    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({ paidOn: today(), reference: null })
    expect(await balanceOf(customer.id)).toBe('-200.00')
  })

  it('may note an Order of the same Customer, for history only', async () => {
    const customer = await createCustomer()
    const order = await createOrder(customer, '750.00')

    const res = await post('/payments', { customerId: customer.id, orderId: order.id, amount: '750', method: 'check' })

    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({ order: { id: order.id, number: order.number }, amount: '750.00' })
    // The Order isn't delivered, so nothing was debited: the Payment is credit on the Balance.
    expect(await balanceOf(customer.id)).toBe('-750.00')
  })

  it('refuses noting an Order of another Customer', async () => {
    const customer = await createCustomer()
    const other = await createCustomer('Otro cliente')
    const order = await createOrder(other)

    const res = await post('/payments', { customerId: customer.id, orderId: order.id, amount: '100', method: 'cash' })

    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('order_not_of_customer')
    expect(await balanceOf(customer.id)).toBe('0.00')
  })

  it('refuses an amount that is not above zero, an unknown method and a bad date', async () => {
    const customer = await createCustomer()

    for (const body of [
      { amount: '0', method: 'cash' },
      { amount: '-10', method: 'cash' },
      { amount: '10,5', method: 'cash' },
      { amount: '10', method: 'on_account' },
      { amount: '10', method: 'cash', paidOn: '21/11/2026' },
    ]) {
      const res = await post('/payments', { customerId: customer.id, ...body })
      expect(res.status).toBe(400)
      expect((await res.json()).error.code).toBe('validation_error')
    }
    expect(await balanceOf(customer.id)).toBe('0.00')
  })

  it('refuses a Payment date later than today in Córdoba', async () => {
    const customer = await createCustomer()
    const tomorrow = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Cordoba' })
      .format(new Date(Date.now() + 24 * 60 * 60 * 1000))

    const res = await post('/payments', { customerId: customer.id, amount: '10', method: 'cash', paidOn: tomorrow })

    expect(res.status).toBe(400)
    const { error } = await res.json()
    expect(error.code).toBe('validation_error')
    expect(error.details.paidOn).toEqual(['La fecha de pago no puede ser futura'])
    expect(await balanceOf(customer.id)).toBe('0.00')
  })

  it('refuses a Customer or Order that is not in the business', async () => {
    const customer = await createCustomer()
    const missing = '00000000-0000-4000-8000-000000000000'

    const noCustomer = await post('/payments', { customerId: missing, amount: '10', method: 'cash' })
    expect(noCustomer.status).toBe(404)
    expect((await noCustomer.json()).error.code).toBe('customer_not_found')

    const noOrder = await post('/payments', { customerId: customer.id, orderId: missing, amount: '10', method: 'cash' })
    expect(noOrder.status).toBe(404)
    expect((await noOrder.json()).error.code).toBe('order_not_found')
  })
})

describe('voiding a Payment', () => {
  it('keeps the Payment marked void, reverses it with a payment_voided entry, and refuses a second void', async () => {
    const customer = await createCustomer()
    const order = await createOrder(customer, '1000.00')
    await post(`/orders/${order.id}/deliver`, { deliveredOn: '2026-11-20' })
    const payment = await (await post('/payments', {
      customerId: customer.id,
      amount: '400',
      method: 'cash',
      paidOn: '2026-11-21',
    })).json()
    expect(await balanceOf(customer.id)).toBe('600.00')

    const res = await post(`/payments/${payment.id}/void`, { reason: 'Cargado dos veces' })

    expect(res.status).toBe(200)
    const voided = await res.json()
    expect(voided).toMatchObject({ id: payment.id, amount: '400.00', voidReason: 'Cargado dos veces' })
    expect(voided.voidedAt).toEqual(expect.any(String))
    expect(await balanceOf(customer.id)).toBe('1000.00')
    expect(await statementOf(customer.id)).toMatchObject([
      { type: 'order_delivered', amount: '1000.00', balance: '1000.00' },
      { type: 'payment', amount: '-400.00', balance: '600.00', payment: { id: payment.id } },
      { type: 'payment_voided', amount: '400.00', balance: '1000.00', entryDate: '2026-11-21', payment: { id: payment.id } },
    ])
    // Still on record, marked void.
    expect(await (await api(`/payments/${payment.id}`)).json()).toMatchObject({ voidReason: 'Cargado dos veces' })

    const again = await post(`/payments/${payment.id}/void`, { reason: 'Otra vez' })
    expect(again.status).toBe(409)
    expect((await again.json()).error.code).toBe('payment_already_voided')
    expect(await balanceOf(customer.id)).toBe('1000.00')
  })

  it('requires a reason', async () => {
    const customer = await createCustomer()
    const payment = await (await post('/payments', { customerId: customer.id, amount: '10', method: 'cash' })).json()

    for (const body of [{}, { reason: '   ' }]) {
      const res = await post(`/payments/${payment.id}/void`, body)
      expect(res.status).toBe(400)
      expect((await res.json()).error.code).toBe('validation_error')
    }
    expect(await balanceOf(customer.id)).toBe('-10.00')
  })

  it('two voids of the same Payment at once reverse it only once', async () => {
    const customer = await createCustomer()
    const payment = await (await post('/payments', { customerId: customer.id, amount: '250', method: 'cash' })).json()

    const results = await Promise.all([
      post(`/payments/${payment.id}/void`, { reason: 'Error' }),
      post(`/payments/${payment.id}/void`, { reason: 'Error' }),
    ])

    expect(results.map(r => r.status).sort()).toEqual([200, 409])
    expect(await balanceOf(customer.id)).toBe('0.00')
  })
})

describe('delivering an Order with a Payment', () => {
  it.each([
    ['in full (cash)', '1200.00', '0.00'],
    ['partially, leaving the difference on the Balance', '500.00', '700.00'],
    ['for more than the total, leaving credit', '1500.00', '-300.00'],
  ])('paid %s', async (_, amount, balance) => {
    const customer = await createCustomer()
    const order = await createOrder(customer, '400.00', 3)
    expect(order.totals.total).toBe('1200.00')

    const res = await post(`/orders/${order.id}/deliver`, {
      deliveredOn: '2026-11-21',
      payment: { amount, method: 'cash' },
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      status: 'delivered',
      payments: [{ amount, method: 'cash', paidOn: '2026-11-21', order: { id: order.id } }],
    })
    expect(await balanceOf(customer.id)).toBe(balance)
    // The delivery debit always comes first, then the Payment taken with it.
    expect(await statementOf(customer.id)).toMatchObject([
      { type: 'order_delivered', amount: '1200.00', entryDate: '2026-11-21' },
      { type: 'payment', amount: `-${amount}`, entryDate: '2026-11-21', balance },
    ])
  })

  it('without a Payment leaves the whole Order on account', async () => {
    const customer = await createCustomer()
    const order = await createOrder(customer, '800.00')

    const res = await post(`/orders/${order.id}/deliver`, { deliveredOn: '2026-11-21' })

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ status: 'delivered', payments: [] })
    expect(await balanceOf(customer.id)).toBe('800.00')
    expect((await statementOf(customer.id)).map(e => e.type)).toEqual(['order_delivered'])
  })

  it('records nothing when the Payment is invalid, nor when the Order can\'t be delivered', async () => {
    const customer = await createCustomer()
    const order = await createOrder(customer, '800.00')

    const invalid = await post(`/orders/${order.id}/deliver`, { payment: { amount: '0', method: 'cash' } })
    expect(invalid.status).toBe(400)
    await post(`/orders/${order.id}/cancel`)
    const cancelled = await post(`/orders/${order.id}/deliver`, { payment: { amount: '800', method: 'cash' } })
    expect(cancelled.status).toBe(409)

    expect(await balanceOf(customer.id)).toBe('0.00')
    expect((await (await api(`/payments?customerId=${customer.id}`)).json()).total).toBe(0)
  })

  it('undoing the delivery leaves the Payment collected with it in place', async () => {
    const customer = await createCustomer()
    const order = await createOrder(customer, '900.00')
    await post(`/orders/${order.id}/deliver`, {
      deliveredOn: '2026-11-21',
      payment: { amount: '900', method: 'bank_transfer', reference: 'TRF-1' },
    })

    const res = await post(`/orders/${order.id}/undo-delivery`)

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      status: 'pending',
      payments: [{ amount: '900.00', reference: 'TRF-1', voidedAt: null }],
    })
    // The charge is reversed but the money received stays: the Customer has it as credit.
    expect(await balanceOf(customer.id)).toBe('-900.00')
    expect((await statementOf(customer.id)).map(e => e.type)).toEqual(['order_delivered', 'payment', 'delivery_undone'])

    // Delivering again without a new Payment settles it.
    await post(`/orders/${order.id}/deliver`, { deliveredOn: '2026-11-22' })
    expect(await balanceOf(customer.id)).toBe('0.00')
  })
})

describe('Payments in the Order and the Customer\'s history', () => {
  it('the Order detail lists the Payments noted against it', async () => {
    const customer = await createCustomer()
    const order = await createOrder(customer, '1000.00')
    const other = await createOrder(customer, '1000.00')
    await post(`/orders/${order.id}/deliver`, { deliveredOn: '2026-11-20', payment: { amount: '300', method: 'cash' } })
    const later = await (await post('/payments', {
      customerId: customer.id,
      orderId: order.id,
      amount: '700',
      method: 'check',
      paidOn: '2026-11-21',
      reference: 'Cheque 123',
    })).json()
    await post('/payments', { customerId: customer.id, orderId: other.id, amount: '50', method: 'cash' })
    await post('/payments', { customerId: customer.id, amount: '20', method: 'cash' })

    const detail = await (await api(`/orders/${order.id}`)).json()

    expect(detail.payments).toMatchObject([
      { id: later.id, amount: '700.00', method: 'check', paidOn: '2026-11-21', reference: 'Cheque 123' },
      { amount: '300.00', method: 'cash', paidOn: '2026-11-20' },
    ])
    expect(detail.payments).toHaveLength(2)
  })

  it('the Customer\'s history lists their Payments newest first, voided ones marked, alongside their Orders', async () => {
    const customer = await createCustomer()
    const other = await createCustomer('Cliente ajeno')
    const order = await createOrder(customer, '500.00')
    await post(`/orders/${order.id}/deliver`, { deliveredOn: '2026-11-20', payment: { amount: '500', method: 'cash' } })
    const mistaken = await (await post('/payments', {
      customerId: customer.id,
      amount: '80',
      method: 'other',
      paidOn: '2026-11-22',
    })).json()
    await post(`/payments/${mistaken.id}/void`, { reason: 'No era de este cliente' })
    await post('/payments', { customerId: other.id, amount: '10', method: 'cash' })

    const res = await api(`/payments?customerId=${customer.id}`)

    expect(res.status).toBe(200)
    const history = await res.json()
    expect(history.total).toBe(2)
    expect(history.items).toMatchObject([
      { id: mistaken.id, amount: '80.00', method: 'other', voidReason: 'No era de este cliente', order: null },
      { amount: '500.00', method: 'cash', voidedAt: null, order: { id: order.id, number: order.number } },
    ])
    const orders = await (await api(`/orders?customerId=${customer.id}`)).json()
    expect(orders.items.map((o: { id: string }) => o.id)).toEqual([order.id])
  })
})

describe('tenant isolation', () => {
  it('another business\'s Payments and Customers are not found', async () => {
    const customer = await createCustomer()
    const payment = await (await post('/payments', { customerId: customer.id, amount: '10', method: 'cash' })).json()
    const stranger = await t.createOwnedBusiness('Otra distribuidora')
    const as = (path: string, init: RequestInit = {}) => t.request(path, { as: stranger.userId, ...init })

    expect((await as(`/payments/${payment.id}`)).status).toBe(404)
    const voided = await as(`/payments/${payment.id}/void`, { method: 'POST', body: JSON.stringify({ reason: 'x' }) })
    expect(voided.status).toBe(404)
    expect((await voided.json()).error.code).toBe('payment_not_found')
    const recorded = await as('/payments', {
      method: 'POST',
      body: JSON.stringify({ customerId: customer.id, amount: '10', method: 'cash' }),
    })
    expect(recorded.status).toBe(404)
    expect(await (await as(`/payments?customerId=${customer.id}`)).json()).toEqual({ items: [], total: 0 })

    // Nothing changed for the owner.
    expect(await balanceOf(customer.id)).toBe('-10.00')
    expect((await (await api(`/payments/${payment.id}`)).json()).voidedAt).toBeNull()
  })
})
