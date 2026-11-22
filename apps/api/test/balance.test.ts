import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { setupTestApp } from './fixtures'

const t = setupTestApp()
afterAll(() => t.close())

let owner: { userId: string, businessId: string }

beforeAll(async () => {
  owner = await t.createOwnedBusiness('Saldos de prueba')
})

function api(path: string, init: RequestInit = {}) {
  return t.request(path, { as: owner.userId, ...init })
}

function post(path: string, body: unknown = {}) {
  return api(path, { method: 'POST', body: JSON.stringify(body) })
}

async function createCustomer(name: string) {
  const res = await post('/customers', { name, branches: [{ address: 'Mitre 10', city: 'Corral de Bustos' }] })
  expect(res.status).toBe(201)
  return (await res.json()) as { id: string, name: string }
}

const tomorrow = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Cordoba' })
  .format(new Date(Date.now() + 24 * 60 * 60 * 1000))

async function balanceOf(customerId: string): Promise<string> {
  const res = await api(`/customers/${customerId}/balance`)
  expect(res.status).toBe(200)
  return (await res.json()).balance
}

describe('Opening balance', () => {
  it('carries a debt over from the Excel sheet onto the Balance, with its date', async () => {
    const customer = await createCustomer('Kiosco Don Pepe')

    const res = await post(`/customers/${customer.id}/opening-balance`, { amount: '184500.00', entryDate: '2026-10-31' })

    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({
      customer: { id: customer.id, name: 'Kiosco Don Pepe' },
      balance: '184500.00',
      entry: { type: 'opening_balance', entryDate: '2026-10-31', amount: '184500.00', reason: null },
    })
    const statement = await (await api(`/customers/${customer.id}/statement`)).json()
    expect(statement.items).toEqual([
      expect.objectContaining({ type: 'opening_balance', entryDate: '2026-10-31', amount: '184500.00', balance: '184500.00' }),
    ])
  })

  it('may be negative, when the Customer carried over a credit', async () => {
    const customer = await createCustomer('Almacén con saldo a favor')

    const res = await post(`/customers/${customer.id}/opening-balance`, { amount: '-8000', entryDate: '2026-10-31' })

    expect(res.status).toBe(201)
    expect(await balanceOf(customer.id)).toBe('-8000.00')
  })

  it('is entered only once per Customer: a second one is refused', async () => {
    const customer = await createCustomer('Despensa Única')
    expect((await post(`/customers/${customer.id}/opening-balance`, { amount: '1000.00', entryDate: '2026-10-31' })).status).toBe(201)

    const second = await post(`/customers/${customer.id}/opening-balance`, { amount: '1000.00', entryDate: '2026-10-31' })

    expect(second.status).toBe(409)
    expect((await second.json()).error.code).toBe('opening_balance_exists')
    expect(await balanceOf(customer.id)).toBe('1000.00')
  })

  it('is entered only once even when two arrive at the same moment', async () => {
    const customer = await createCustomer('Doble clic')
    const body = { amount: '500.00', entryDate: '2026-10-31' }

    const statuses = (await Promise.all([
      post(`/customers/${customer.id}/opening-balance`, body),
      post(`/customers/${customer.id}/opening-balance`, body),
    ])).map(r => r.status).sort()

    expect(statuses).toEqual([201, 409])
    expect(await balanceOf(customer.id)).toBe('500.00')
  })

  it('needs a non-zero amount and a valid date', async () => {
    const customer = await createCustomer('Datos inválidos')

    const zero = await post(`/customers/${customer.id}/opening-balance`, { amount: '0.00', entryDate: '2026-10-31' })
    const noDate = await post(`/customers/${customer.id}/opening-balance`, { amount: '100.00' })

    expect(zero.status).toBe(400)
    expect((await zero.json()).error.details).toHaveProperty('amount')
    expect(noDate.status).toBe(400)
    expect((await noDate.json()).error.details).toHaveProperty('entryDate')
    expect(await balanceOf(customer.id)).toBe('0.00')
  })

  it('refuses a date later than today in Córdoba', async () => {
    const customer = await createCustomer('Saldo a futuro')

    const res = await post(`/customers/${customer.id}/opening-balance`, { amount: '100.00', entryDate: tomorrow() })

    expect(res.status).toBe(400)
    const { error } = await res.json()
    expect(error.code).toBe('validation_error')
    expect(error.details.entryDate).toEqual(['La fecha del saldo inicial no puede ser futura'])
    expect(await balanceOf(customer.id)).toBe('0.00')
  })

  it('is refused for a Customer of another business', async () => {
    const other = await t.createOwnedBusiness('Otro negocio')
    const theirs = await t.request('/customers', {
      as: other.userId,
      method: 'POST',
      body: JSON.stringify({ name: 'Cliente ajeno', branches: [{ address: 'San Martín 1', city: 'Cruz Alta' }] }),
    })
    const customer = await theirs.json()

    const res = await post(`/customers/${customer.id}/opening-balance`, { amount: '100.00', entryDate: '2026-10-31' })

    expect(res.status).toBe(404)
    expect((await res.json()).error.code).toBe('customer_not_found')
  })
})

describe('Balance adjustment', () => {
  it('writes off part of a debt, with its reason, and shows on the statement', async () => {
    const customer = await createCustomer('Deudor incobrable')
    await post(`/customers/${customer.id}/opening-balance`, { amount: '5000.00', entryDate: '2026-10-31' })

    const res = await post(`/customers/${customer.id}/balance-adjustments`, {
      amount: '-1500.50',
      reason: 'Incobrable: cerró el negocio',
      entryDate: '2026-11-15',
    })

    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({
      balance: '3499.50',
      entry: { type: 'adjustment', entryDate: '2026-11-15', amount: '-1500.50', reason: 'Incobrable: cerró el negocio' },
    })
    const statement = await (await api(`/customers/${customer.id}/statement`)).json()
    expect(statement.items.at(-1)).toMatchObject({ type: 'adjustment', amount: '-1500.50', balance: '3499.50', reason: 'Incobrable: cerró el negocio' })
  })

  it('may raise the Balance, and can be entered as many times as needed', async () => {
    const customer = await createCustomer('Saldo mal pasado')

    await post(`/customers/${customer.id}/balance-adjustments`, { amount: '200.00', reason: 'Faltó pasar una boleta del Excel' })
    const second = await post(`/customers/${customer.id}/balance-adjustments`, { amount: '50', reason: 'Otra boleta' })

    expect(second.status).toBe(201)
    expect(await balanceOf(customer.id)).toBe('250.00')
  })

  it('requires a reason and a non-zero amount', async () => {
    const customer = await createCustomer('Ajuste inválido')

    const noReason = await post(`/customers/${customer.id}/balance-adjustments`, { amount: '100.00' })
    const blankReason = await post(`/customers/${customer.id}/balance-adjustments`, { amount: '100.00', reason: '   ' })
    const zero = await post(`/customers/${customer.id}/balance-adjustments`, { amount: '0', reason: 'Nada' })

    expect(noReason.status).toBe(400)
    expect((await noReason.json()).error.details).toHaveProperty('reason')
    expect(blankReason.status).toBe(400)
    expect((await blankReason.json()).error.details).toHaveProperty('reason')
    expect(zero.status).toBe(400)
    expect((await zero.json()).error.details).toHaveProperty('amount')
    expect(await balanceOf(customer.id)).toBe('0.00')
  })

  it('refuses a date later than today in Córdoba', async () => {
    const customer = await createCustomer('Ajuste a futuro')

    const res = await post(`/customers/${customer.id}/balance-adjustments`, { amount: '-100.00', reason: 'Descuento', entryDate: tomorrow() })

    expect(res.status).toBe(400)
    const { error } = await res.json()
    expect(error.code).toBe('validation_error')
    expect(error.details.entryDate).toEqual(['La fecha del ajuste no puede ser futura'])
    expect(await balanceOf(customer.id)).toBe('0.00')
  })
})

describe('Customers with a Balance', () => {
  it('lists every Customer whose Balance is not zero, largest first, with the total owed', async () => {
    const business = await t.createOwnedBusiness('Cobranzas')
    const as = business.userId
    const call = (path: string, body?: unknown) =>
      t.request(path, body === undefined ? { as } : { as, method: 'POST', body: JSON.stringify(body) })
    const customer = async (name: string) =>
      (await (await call('/customers', { name, branches: [{ address: 'Mitre 1', city: 'Leones' }] })).json()) as { id: string }

    const small = await customer('Debe poco')
    const big = await customer('Debe mucho')
    const credit = await customer('Tiene saldo a favor')
    const settled = await customer('Saldado')
    await customer('Sin movimientos')
    await call(`/customers/${small.id}/opening-balance`, { amount: '1500.00', entryDate: '2026-10-31' })
    await call(`/customers/${big.id}/opening-balance`, { amount: '96750.00', entryDate: '2026-10-31' })
    await call(`/customers/${credit.id}/opening-balance`, { amount: '-8000.00', entryDate: '2026-10-31' })
    await call(`/customers/${settled.id}/opening-balance`, { amount: '300.00', entryDate: '2026-10-31' })
    await call(`/customers/${settled.id}/balance-adjustments`, { amount: '-300.00', reason: 'Condonado' })

    const res = await call('/customers/with-balance')

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      items: [
        { customer: { id: big.id, name: 'Debe mucho' }, balance: '96750.00' },
        { customer: { id: small.id, name: 'Debe poco' }, balance: '1500.00' },
        { customer: { id: credit.id, name: 'Tiene saldo a favor' }, balance: '-8000.00' },
      ],
      total: 3,
      balanceTotal: '90250.00',
    })

    const page = await (await call('/customers/with-balance?limit=1&offset=1')).json()
    expect(page).toEqual({
      items: [{ customer: { id: small.id, name: 'Debe poco' }, balance: '1500.00' }],
      total: 3,
      balanceTotal: '90250.00',
    })
  })

  it('is empty, with a zero total, for a business where nobody owes anything', async () => {
    const business = await t.createOwnedBusiness('Sin deudas')

    const res = await t.request('/customers/with-balance', { as: business.userId })

    expect(await res.json()).toEqual({ items: [], total: 0, balanceTotal: '0.00' })
  })
})
