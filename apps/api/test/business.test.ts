import { todayInCordoba } from '@pollux/contracts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { setupTestApp } from './fixtures'

const t = setupTestApp()
afterAll(() => t.close())

let owner: { userId: string, businessId: string }

function api(path: string, init: RequestInit = {}) {
  return t.request(path, { as: owner.userId, ...init })
}

function patch(body: unknown, as = owner.userId) {
  return t.request('/business', { as, method: 'PATCH', body: JSON.stringify(body) })
}

/** A business with every one of its own details filled. */
const fullDetails = {
  legalName: 'Distribuidora Datos S.R.L.',
  cuit: '30-71234567-8',
  vatCondition: 'responsable_inscripto',
  address: 'San Martín 123',
  city: 'Corral de Bustos',
  province: 'Córdoba',
  postalCode: '2645',
  phone: '3468 412345',
  grossIncomeNumber: '280-123456-7',
  activityStartDate: '2015-03-01',
} as const

beforeAll(async () => {
  owner = await t.createOwnedBusiness('Distribuidora Datos', fullDetails)
})

describe('Business details', () => {
  it('reads the selected business\'s own data', async () => {
    const res = await api('/business')

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ id: owner.businessId, name: 'Distribuidora Datos', ...fullDetails })
  })

  it('answers null for the details a business has not entered', async () => {
    const bare = await t.createOwnedBusiness('Negocio sin datos')

    const res = await t.request('/business', { as: bare.userId })

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      id: bare.businessId,
      name: 'Negocio sin datos',
      legalName: null,
      cuit: null,
      vatCondition: null,
      address: null,
      city: null,
      province: null,
      postalCode: null,
      phone: null,
      grossIncomeNumber: null,
      activityStartDate: null,
    })
  })

  it('edits only the given fields and keeps the rest', async () => {
    const res = await patch({ name: 'Distribuidora Datos Nueva', phone: '3468 499999', cuit: '20123456786' })

    expect(res.status).toBe(200)
    const expected = { ...fullDetails, name: 'Distribuidora Datos Nueva', phone: '3468 499999', cuit: '20-12345678-6' }
    expect(await res.json()).toMatchObject(expected)
    expect(await (await api('/business')).json()).toMatchObject(expected)
  })

  it('clears an optional field with null or an empty string', async () => {
    const res = await patch({ legalName: null, grossIncomeNumber: '', cuit: '', vatCondition: null, activityStartDate: null })

    expect(res.status).toBe(200)
    const cleared = { legalName: null, grossIncomeNumber: null, cuit: null, vatCondition: null, activityStartDate: null }
    expect(await res.json()).toMatchObject({ ...cleared, address: fullDetails.address })
    expect(await (await api('/business')).json()).toMatchObject(cleared)
  })

  it('shows the edited data on the next Delivery note', async () => {
    const business = await t.createOwnedBusiness('Negocio con Remito')
    const as = business.userId
    const send = (path: string, body: unknown, method = 'POST') =>
      t.request(path, { as, method, body: JSON.stringify(body) })

    expect((await send('/business', { legalName: 'Remitente S.A.', city: 'Isla Verde' }, 'PATCH')).status).toBe(200)
    const customer = await (await send('/customers', { name: 'Kiosco', branches: [{ address: 'Belgrano 1', city: 'Isla Verde' }] })).json()
    const product = await (await send('/products', { code: 'B-1', name: 'Bolsa', price: '100.00' })).json()
    const order = await (await send('/orders', {
      customerId: customer.id,
      branchId: customer.branches[0].id,
      deliveryDate: todayInCordoba(),
      lines: [{ productId: product.id, quantity: 1 }],
    })).json()

    const note = await send(`/orders/${order.id}/delivery-note`, {})

    expect(note.status).toBe(200)
    expect((await note.json()).business).toMatchObject({ name: 'Negocio con Remito', legalName: 'Remitente S.A.', city: 'Isla Verde' })
  })

  it('refuses an empty name, an invalid CUIT, an unknown VAT condition and a malformed or future start of activities', async () => {
    const res = await patch({ name: ' ', cuit: '20123456780', vatCondition: 'otro', activityStartDate: '01/03/2015' })

    expect(res.status).toBe(400)
    const { error } = await res.json()
    expect(error.code).toBe('validation_error')
    expect(Object.keys(error.details)).toEqual(expect.arrayContaining(['name', 'cuit', 'vatCondition', 'activityStartDate']))

    const future = await patch({ activityStartDate: '2999-01-01' })
    expect(future.status).toBe(400)
    expect(Object.keys((await future.json()).error.details)).toEqual(['activityStartDate'])

    const nullName = await patch({ name: null })
    expect(nullName.status).toBe(400)
    expect(Object.keys((await nullName.json()).error.details)).toEqual(['name'])
  })

  it('never reads or changes another business\'s data', async () => {
    const other = await t.createOwnedBusiness('Otro negocio', { legalName: 'Otro S.A.', phone: '111' })
    const before = await (await api('/business')).json()

    const otherRead = await t.request('/business', { as: other.userId })
    expect(await otherRead.json()).toMatchObject({ id: other.businessId, name: 'Otro negocio', legalName: 'Otro S.A.' })

    expect((await patch({ phone: '222', legalName: 'Cambiado por otro' }, other.userId)).status).toBe(200)
    expect(await (await api('/business')).json()).toMatchObject({ phone: before.phone, legalName: before.legalName, name: before.name })

    const notMember = await t.request('/business', {
      as: other.userId,
      businessId: owner.businessId,
      method: 'PATCH',
      body: JSON.stringify({ name: 'Hackeado' }),
    })
    expect(notMember.status).toBe(403)
    expect(await (await api('/business')).json()).toMatchObject({ name: before.name })
  })
})
