import { hc } from 'hono/client'
import { afterAll, beforeAll, describe, expect, expectTypeOf, it } from 'vitest'
import type { AppType } from '../src/app'
import { setupTestApp } from './fixtures'

const t = setupTestApp()
afterAll(() => t.close())

let owner: { userId: string, businessId: string }

beforeAll(async () => {
  owner = await t.createOwnedBusiness('Distribuidora Clientes')
})

function api(path: string, init: RequestInit = {}) {
  return t.request(path, { as: owner.userId, ...init })
}

function post(path: string, body: unknown) {
  return api(path, { method: 'POST', body: JSON.stringify(body) })
}

function patch(path: string, body: unknown) {
  return api(path, { method: 'PATCH', body: JSON.stringify(body) })
}

describe('creating a Customer', () => {
  it('registers a Customer with all its details and its first Branch', async () => {
    const res = await post('/customers', {
      name: 'Almacén Don Pepe',
      legalName: 'Pepe Pérez SRL',
      cuit: '30-71234567-1',
      vatCondition: 'responsable_inscripto',
      phone: '3468 412345',
      notes: 'Abre a las 8',
      branches: [{ address: 'San Martín 123', city: 'Corral de Bustos' }],
    })

    expect(res.status).toBe(201)
    const customer = await res.json()
    expect(customer).toEqual({
      id: expect.any(String),
      name: 'Almacén Don Pepe',
      legalName: 'Pepe Pérez SRL',
      cuit: '30-71234567-1',
      vatCondition: 'responsable_inscripto',
      phone: '3468 412345',
      notes: 'Abre a las 8',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
      branches: [{
        id: expect.any(String),
        name: null,
        address: 'San Martín 123',
        city: 'Corral de Bustos',
        province: 'Córdoba',
        postalCode: null,
        notes: null,
      }],
    })
  })

  it('needs only a name and one Branch; optional details are empty', async () => {
    const res = await post('/customers', {
      name: 'Kiosco La Esquina',
      legalName: '',
      cuit: '',
      branches: [{ address: 'Belgrano 50', city: 'Leones', province: 'Córdoba', postalCode: '2594' }],
    })

    expect(res.status).toBe(201)
    const customer = await res.json()
    expect(customer).toMatchObject({
      name: 'Kiosco La Esquina',
      legalName: null,
      cuit: null,
      vatCondition: null,
      phone: null,
      notes: null,
      branches: [{ address: 'Belgrano 50', city: 'Leones', postalCode: '2594' }],
    })
  })

  it('stores a CUIT typed without dashes in the XX-XXXXXXXX-X format', async () => {
    const res = await post('/customers', {
      name: 'Despensa Sur',
      cuit: '20123456786',
      branches: [{ address: 'Mitre 9', city: 'Marcos Juárez' }],
    })

    expect(res.status).toBe(201)
    expect((await res.json()).cuit).toBe('20-12345678-6')
  })

  it('rejects a Customer with no Branches', async () => {
    const res = await post('/customers', { name: 'Sin sucursal', branches: [] })

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({
      error: {
        code: 'validation_error',
        message: expect.any(String),
        details: { branches: ['Agregá al menos una sucursal'] },
      },
    })
  })

  it('rejects a Customer without the branches field', async () => {
    const res = await post('/customers', { name: 'Sin sucursal' })

    expect(res.status).toBe(400)
    expect((await res.json()).error.details).toHaveProperty('branches')
  })

  it('rejects a CUIT with a wrong check digit with a field error', async () => {
    const res = await post('/customers', {
      name: 'CUIT malo',
      cuit: '30-71234567-2',
      branches: [{ address: 'Roca 1', city: 'Leones' }],
    })

    expect(res.status).toBe(400)
    expect((await res.json()).error.details).toEqual({ cuit: ['El CUIT no es válido'] })
  })

  it('rejects a CUIT with the wrong format with a field error', async () => {
    const res = await post('/customers', {
      name: 'CUIT corto',
      cuit: '30-7123',
      branches: [{ address: 'Roca 1', city: 'Leones' }],
    })

    expect(res.status).toBe(400)
    expect((await res.json()).error.details).toEqual({ cuit: ['El CUIT no es válido'] })
  })

  it('rejects a Branch without address or town, naming the fields', async () => {
    const res = await post('/customers', {
      name: 'Sucursal incompleta',
      branches: [{ address: ' ', city: '' }],
    })

    expect(res.status).toBe(400)
    expect((await res.json()).error.details).toEqual({
      'branches.0.address': ['Ingresá la dirección'],
      'branches.0.city': ['Ingresá la localidad'],
    })
  })
})

async function createCustomer(overrides: Record<string, unknown> = {}) {
  const res = await post('/customers', {
    name: 'Cliente de prueba',
    branches: [{ address: 'Rivadavia 100', city: 'Corral de Bustos' }],
    ...overrides,
  })
  expect(res.status).toBe(201)
  return res.json()
}

describe('a Customer\'s detail', () => {
  it('includes its Branches', async () => {
    const created = await createCustomer({
      name: 'Supermercado Dos Sucursales',
      branches: [
        { name: 'Centro', address: 'Colón 10', city: 'Cruz Alta' },
        { name: 'Ruta', address: 'Ruta 11 km 3', city: 'Camilo Aldao' },
      ],
    })

    const res = await api(`/customers/${created.id}`)

    expect(res.status).toBe(200)
    const customer = await res.json()
    expect(customer).toEqual(created)
    expect(customer.branches.map((b: { name: string }) => b.name).sort()).toEqual(['Centro', 'Ruta'])
  })

  it('is 404 for a Customer that does not exist', async () => {
    const res = await api('/customers/00000000-0000-4000-8000-000000000000')

    expect(res.status).toBe(404)
    expect((await res.json()).error.code).toBe('customer_not_found')
  })
})

describe('editing a Customer', () => {
  it('changes the given details, clears the ones sent as null and keeps the rest', async () => {
    const created = await createCustomer({ phone: '3468 400000', notes: 'Viejo', legalName: 'Viejo SA' })

    const res = await patch(`/customers/${created.id}`, {
      name: 'Cliente renombrado',
      cuit: '30712345671',
      vatCondition: 'monotributo',
      notes: null,
    })

    expect(res.status).toBe(200)
    const customer = await res.json()
    expect(customer).toMatchObject({
      id: created.id,
      name: 'Cliente renombrado',
      legalName: 'Viejo SA',
      cuit: '30-71234567-1',
      vatCondition: 'monotributo',
      phone: '3468 400000',
      notes: null,
      branches: created.branches,
    })
    expect(await (await api(`/customers/${created.id}`)).json()).toEqual(customer)
  })

  it('checks a new CUIT like on create', async () => {
    const created = await createCustomer()

    const res = await patch(`/customers/${created.id}`, { cuit: '11-11111111-1' })

    expect(res.status).toBe(400)
    expect((await res.json()).error.details).toEqual({ cuit: ['El CUIT no es válido'] })
  })

  it('refuses an empty name', async () => {
    const created = await createCustomer()

    const res = await patch(`/customers/${created.id}`, { name: '' })

    expect(res.status).toBe(400)
    expect((await res.json()).error.details).toEqual({ name: ['Ingresá el nombre'] })
  })
})

describe('Branches', () => {
  it('can be added to a Customer', async () => {
    const created = await createCustomer()

    const res = await post(`/customers/${created.id}/branches`, {
      name: 'Depósito',
      address: 'Sarmiento 400',
      city: 'Monte Buey',
      notes: 'Entregar por la tarde',
    })

    expect(res.status).toBe(201)
    const customer = await res.json()
    expect(customer.branches).toHaveLength(2)
    expect(customer.branches).toContainEqual({
      id: expect.any(String),
      name: 'Depósito',
      address: 'Sarmiento 400',
      city: 'Monte Buey',
      province: 'Córdoba',
      postalCode: null,
      notes: 'Entregar por la tarde',
    })
    expect(await (await api(`/customers/${created.id}`)).json()).toEqual(customer)
  })

  it('can be edited', async () => {
    const created = await createCustomer()
    const branchId = created.branches[0].id

    const res = await patch(`/customers/${created.id}/branches/${branchId}`, {
      address: 'Rivadavia 250',
      postalCode: '2645',
    })

    expect(res.status).toBe(200)
    const customer = await res.json()
    expect(customer.branches).toEqual([{
      ...created.branches[0],
      address: 'Rivadavia 250',
      postalCode: '2645',
    }])
  })

  it('refuses a new Branch without a town', async () => {
    const created = await createCustomer()

    const res = await post(`/customers/${created.id}/branches`, { address: 'Sin localidad 1' })

    expect(res.status).toBe(400)
    expect((await res.json()).error.details).toHaveProperty('city')
  })

  it('cannot be edited through another Customer', async () => {
    const first = await createCustomer()
    const second = await createCustomer()

    const res = await patch(`/customers/${second.id}/branches/${first.branches[0].id}`, { city: 'Otra' })

    expect(res.status).toBe(404)
    expect((await res.json()).error.code).toBe('branch_not_found')
  })
})

describe('tenant isolation', () => {
  let stranger: { userId: string, businessId: string }
  let theirs: { id: string, branches: { id: string }[] }

  beforeAll(async () => {
    stranger = await t.createOwnedBusiness('Otra distribuidora')
    const res = await t.request('/customers', {
      as: stranger.userId,
      method: 'POST',
      body: JSON.stringify({ name: 'Cliente ajeno', branches: [{ address: 'Lejos 1', city: 'Rosario' }] }),
    })
    theirs = await res.json()
  })

  it('another business\'s Customer is 404 on read', async () => {
    const res = await api(`/customers/${theirs.id}`)

    expect(res.status).toBe(404)
    expect((await res.json()).error.code).toBe('customer_not_found')
  })

  it('another business\'s Customer is 404 on edit, and stays unchanged', async () => {
    const res = await patch(`/customers/${theirs.id}`, { name: 'Robado' })

    expect(res.status).toBe(404)
    expect((await res.json()).error.code).toBe('customer_not_found')
    const after = await t.request(`/customers/${theirs.id}`, { as: stranger.userId })
    expect((await after.json()).name).toBe('Cliente ajeno')
  })

  it('another business\'s Customer cannot get or change Branches', async () => {
    const added = await post(`/customers/${theirs.id}/branches`, { address: 'Intruso 1', city: 'Leones' })
    const edited = await patch(`/customers/${theirs.id}/branches/${theirs.branches[0]!.id}`, { city: 'Leones' })

    expect(added.status).toBe(404)
    expect(edited.status).toBe(404)
    const after = await t.request(`/customers/${theirs.id}`, { as: stranger.userId })
    expect((await after.json()).branches).toEqual([expect.objectContaining({ city: 'Rosario' })])
  })

  it('another business\'s Customers never show in the list', async () => {
    const res = await api('/customers?q=ajeno')

    expect(await res.json()).toEqual({ items: [], total: 0 })
  })
})

describe('listing Customers', () => {
  // Its own business, so the totals below count only these Customers.
  let lister: { userId: string, businessId: string }

  function list(query: string) {
    return t.request(`/customers${query}`, { as: lister.userId })
  }

  async function names(query: string) {
    const res = await list(query)
    expect(res.status).toBe(200)
    const body = await res.json()
    return { names: body.items.map((c: { name: string }) => c.name), total: body.total }
  }

  beforeAll(async () => {
    lister = await t.createOwnedBusiness('Distribuidora Listados')
    const customers = [
      { name: 'Bar El Faro', cuit: '20-12345678-6', branches: [{ address: 'Costanera 1', city: 'Corral de Bustos' }] },
      { name: 'Almacén Norte', legalName: 'Faroles y Cía SRL', branches: [{ address: 'Norte 2', city: 'Leones' }] },
      {
        name: 'Carnicería 100%_Real',
        cuit: '30-71234567-1',
        branches: [
          { address: 'Mitre 3', city: 'Marcos Juárez' },
          { address: 'Ruta 9 km 1', city: 'corral de bustos' },
        ],
      },
      { name: 'Despensa Doña Ana', branches: [{ address: 'Sur 4', city: 'Leones' }] },
    ]
    for (const body of customers) {
      const res = await t.request('/customers', { as: lister.userId, method: 'POST', body: JSON.stringify(body) })
      expect(res.status).toBe(201)
    }
  })

  it('lists every Customer by name, with their Branches, as { items, total }', async () => {
    const res = await list('')

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.total).toBe(4)
    expect(body.items.map((c: { name: string }) => c.name)).toEqual([
      'Almacén Norte',
      'Bar El Faro',
      'Carnicería 100%_Real',
      'Despensa Doña Ana',
    ])
    expect(body.items[2].branches).toHaveLength(2)
    expect(body.items[0]).toEqual({
      id: expect.any(String),
      name: 'Almacén Norte',
      legalName: 'Faroles y Cía SRL',
      cuit: null,
      vatCondition: null,
      phone: null,
      notes: null,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
      branches: [expect.objectContaining({ address: 'Norte 2', city: 'Leones' })],
    })
  })

  it('searches by name and by legal name, ignoring case', async () => {
    expect(await names('?q=faro')).toEqual({ names: ['Almacén Norte', 'Bar El Faro'], total: 2 })
    expect(await names('?q=DOÑA')).toEqual({ names: ['Despensa Doña Ana'], total: 1 })
  })

  it('searches by CUIT, with or without dashes', async () => {
    expect(await names('?q=30-71234567')).toEqual({ names: ['Carnicería 100%_Real'], total: 1 })
    expect(await names('?q=2012345')).toEqual({ names: ['Bar El Faro'], total: 1 })
  })

  it('treats % and _ in the search as plain text', async () => {
    expect(await names(`?q=${encodeURIComponent('100%_')}`)).toEqual({ names: ['Carnicería 100%_Real'], total: 1 })
    expect(await names(`?q=${encodeURIComponent('%')}`)).toEqual({ names: ['Carnicería 100%_Real'], total: 1 })
  })

  it('filters by town, matching any Branch and ignoring case', async () => {
    expect(await names(`?town=${encodeURIComponent('Corral de Bustos')}`))
      .toEqual({ names: ['Bar El Faro', 'Carnicería 100%_Real'], total: 2 })
    expect(await names('?town=leones')).toEqual({ names: ['Almacén Norte', 'Despensa Doña Ana'], total: 2 })
  })

  it('combines search and town filter', async () => {
    expect(await names('?town=Leones&q=faro')).toEqual({ names: ['Almacén Norte'], total: 1 })
  })

  it('pages with limit and offset while total counts every match', async () => {
    expect(await names('?limit=2')).toEqual({ names: ['Almacén Norte', 'Bar El Faro'], total: 4 })
    expect(await names('?limit=2&offset=2')).toEqual({ names: ['Carnicería 100%_Real', 'Despensa Doña Ana'], total: 4 })
    expect(await names('?offset=10')).toEqual({ names: [], total: 4 })
  })

  it('rejects an invalid limit', async () => {
    const res = await list('?limit=0')

    expect(res.status).toBe(400)
    expect((await res.json()).error.details).toHaveProperty('limit')
  })
})

describe('the business\'s Localidades (towns)', () => {
  // Its own business, so only these Branches' towns are listed.
  let townsOwner: { userId: string, businessId: string }

  function towns(as: string) {
    return t.request('/customers/towns', { as })
  }

  beforeAll(async () => {
    townsOwner = await t.createOwnedBusiness('Distribuidora Localidades')
    const customers = [
      { name: 'Almacén Uno', branches: [{ address: 'A 1', city: 'Corral de Bustos' }, { address: 'A 2', city: 'Leones' }] },
      { name: 'Almacén Dos', branches: [{ address: 'B 1', city: 'corral de bustos' }] },
      { name: 'Almacén Tres', branches: [{ address: 'C 1', city: 'Corral de Bustos' }, { address: 'C 2', city: 'Ñanducita' }] },
      { name: 'Almacén Cuatro', branches: [{ address: 'D 1', city: 'Árbol Chato' }, { address: 'D 2', city: 'Ordóñez' }] },
      { name: 'Almacén Cinco', branches: [{ address: 'E 1', city: 'Bell Ville' }, { address: 'E 2', city: 'LEONES' }] },
    ]
    for (const body of customers) {
      const res = await t.request('/customers', { as: townsOwner.userId, method: 'POST', body: JSON.stringify(body) })
      expect(res.status).toBe(201)
    }
  })

  it('lists each town of the business\'s Branches once, in Spanish alphabetical order', async () => {
    const res = await towns(townsOwner.userId)

    expect(res.status).toBe(200)
    const { items } = await res.json()
    // Á sorts with A and Ñ between N and O, as a Spanish reader expects.
    expect(items).toHaveLength(6)
    expect(items.map((town: string) => town.toLowerCase()))
      .toEqual(['árbol chato', 'bell ville', 'corral de bustos', 'leones', 'ñanducita', 'ordóñez'])
  })

  it('merges spellings that differ only in case, showing the most used one', async () => {
    const { items } = await (await towns(townsOwner.userId)).json()

    // 'Corral de Bustos' twice, 'corral de bustos' once.
    expect(items).toContain('Corral de Bustos')
    expect(items).not.toContain('corral de bustos')
  })

  it('lists only the active business\'s towns', async () => {
    const stranger = await t.createOwnedBusiness('Otra distribuidora de localidades')
    const res = await t.request('/customers', {
      as: stranger.userId,
      method: 'POST',
      body: JSON.stringify({ name: 'Cliente ajeno', branches: [{ address: 'Lejos 1', city: 'Rosario' }] }),
    })
    expect(res.status).toBe(201)

    expect(await (await towns(stranger.userId)).json()).toEqual({ items: ['Rosario'] })
    expect((await (await towns(townsOwner.userId)).json()).items).not.toContain('Rosario')
  })

  it('is typed for the dashboard\'s hc client as { items: string[] }', async () => {
    const client = hc<AppType>('http://localhost', {
      fetch: (input: RequestInfo | URL, init?: RequestInit) => t.app.request(input, init),
      headers: { Authorization: `Bearer ${townsOwner.userId}` },
    })

    const res = await client.customers.towns.$get()
    const body = await res.json()

    expectTypeOf(body).toEqualTypeOf<{ items: string[] }>()
    expect(body.items).toContain('Leones')
  })

  it('is empty for a business with no Customers yet', async () => {
    const empty = await t.createOwnedBusiness('Distribuidora sin clientes')

    expect(await (await towns(empty.userId)).json()).toEqual({ items: [] })
  })
})
