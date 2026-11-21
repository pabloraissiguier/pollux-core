import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { setupTestApp } from './fixtures'

const t = setupTestApp()
afterAll(() => t.close())

let owner: { userId: string, businessId: string }
let descartables: { id: string, name: string }
let limpieza: { id: string, name: string }

function api(path: string, init: RequestInit = {}) {
  return t.request(path, { as: owner.userId, ...init })
}

function post(path: string, body: unknown) {
  return api(path, { method: 'POST', body: JSON.stringify(body) })
}

function patch(path: string, body: unknown) {
  return api(path, { method: 'PATCH', body: JSON.stringify(body) })
}

async function createProduct(body: Record<string, unknown>) {
  const res = await post('/products', { name: 'Producto', price: '100.00', ...body })
  expect(res.status).toBe(201)
  return res.json()
}

beforeAll(async () => {
  owner = await t.createOwnedBusiness('Distribuidora Catálogo')
  descartables = await (await post('/categories', { name: 'Descartables' })).json()
  limpieza = await (await post('/categories', { name: 'Limpieza' })).json()
})

describe('creating a Product', () => {
  it('registers a Product with its Code, name, Brand, Category, Price and VAT rate, Active', async () => {
    const res = await post('/products', {
      code: 'VT-180',
      name: 'Vaso térmico 180 cc x 50',
      brand: 'Termolar',
      categoryId: descartables.id,
      price: '1234.5',
      vatRate: '10.5',
    })

    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({
      id: expect.any(String),
      code: 'VT-180',
      name: 'Vaso térmico 180 cc x 50',
      brand: 'Termolar',
      category: { id: descartables.id, name: 'Descartables' },
      price: '1234.50',
      vatRate: '10.50',
      isActive: true,
      stock: { onHand: 0, reserved: 0, available: 0 },
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    })
  })

  it('defaults the VAT rate to 21 and leaves Brand and Category empty when not given', async () => {
    const product = await createProduct({ code: 'GEN-1', name: 'Bolsa genérica', brand: '', price: '50' })

    expect(product).toMatchObject({ brand: null, category: null, price: '50.00', vatRate: '21.00' })
  })

  it('refuses a duplicate Code in the same business with 409', async () => {
    await createProduct({ code: 'DUP-1' })

    const res = await post('/products', { code: 'DUP-1', name: 'Otro', price: '1.00' })

    expect(res.status).toBe(409)
    expect((await res.json()).error.code).toBe('product_code_taken')
  })

  it('rejects a Price sent as a number, a negative Price and a VAT rate over 100', async () => {
    const res = await post('/products', { code: 'BAD-1', name: 'Malo', price: 10, vatRate: '150' })
    const negative = await post('/products', { code: 'BAD-2', name: 'Malo', price: '-1.00' })

    expect(res.status).toBe(400)
    expect(Object.keys((await res.json()).error.details).sort()).toEqual(['price', 'vatRate'])
    expect(negative.status).toBe(400)
    expect((await negative.json()).error.details).toEqual({ price: ['El precio no puede ser negativo'] })
  })

  it('answers 404 for a Category that does not exist', async () => {
    const res = await post('/products', { code: 'NOCAT', name: 'Sin categoría', price: '1.00', categoryId: randomUUID() })

    expect(res.status).toBe(404)
    expect((await res.json()).error.code).toBe('category_not_found')
  })
})

describe('editing a Product', () => {
  it('changes the given fields and keeps the rest', async () => {
    const product = await createProduct({ code: 'ED-1', name: 'Rollo cocina', brand: 'Elite', categoryId: descartables.id })

    const res = await patch(`/products/${product.id}`, { code: 'ED-1B', name: 'Rollo de cocina x3', categoryId: limpieza.id, vatRate: '21' })

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      id: product.id,
      code: 'ED-1B',
      name: 'Rollo de cocina x3',
      brand: 'Elite',
      category: { id: limpieza.id, name: 'Limpieza' },
      price: '100.00',
      vatRate: '21.00',
    })
  })

  it('clears the Brand and the Category with null', async () => {
    const product = await createProduct({ code: 'ED-2', brand: 'Elite', categoryId: descartables.id })

    const res = await patch(`/products/${product.id}`, { brand: null, categoryId: null })

    expect(await res.json()).toMatchObject({ brand: null, category: null })
  })

  it('refuses changing the Code to one another Product has with 409', async () => {
    await createProduct({ code: 'ED-3' })
    const other = await createProduct({ code: 'ED-4' })

    const res = await patch(`/products/${other.id}`, { code: 'ED-3' })

    expect(res.status).toBe(409)
    expect((await res.json()).error.code).toBe('product_code_taken')
  })

  it('shows the edited Product on its detail', async () => {
    const product = await createProduct({ code: 'ED-5' })
    await patch(`/products/${product.id}`, { name: 'Renombrado' })

    const res = await api(`/products/${product.id}`)

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ id: product.id, code: 'ED-5', name: 'Renombrado' })
  })

  it('answers 404 for a Product that does not exist', async () => {
    const detail = await api(`/products/${randomUUID()}`)
    const edit = await patch(`/products/${randomUUID()}`, { name: 'Nada' })

    expect(detail.status).toBe(404)
    expect((await detail.json()).error.code).toBe('product_not_found')
    expect(edit.status).toBe(404)
    expect((await edit.json()).error.code).toBe('product_not_found')
  })
})

describe('listing and searching Products', () => {
  // A business of its own, so the list holds exactly these Products.
  let shop: { userId: string, businessId: string }
  let vasos: { id: string }
  let bolsas: { id: string }

  const as = (path: string, init: RequestInit = {}) => t.request(path, { as: shop.userId, ...init })
  const names = async (path: string) => {
    const res = await as(path)
    expect(res.status).toBe(200)
    const body = await res.json()
    return { names: body.items.map((p: { name: string }) => p.name), total: body.total }
  }

  beforeAll(async () => {
    shop = await t.createOwnedBusiness('Negocio para listar')
    vasos = await (await as('/categories', { method: 'POST', body: JSON.stringify({ name: 'Vasos' }) })).json()
    bolsas = await (await as('/categories', { method: 'POST', body: JSON.stringify({ name: 'Bolsas' }) })).json()
    const items = [
      { code: 'V-1', name: 'Vaso 180 cc', brand: 'Termolar', categoryId: vasos.id },
      { code: 'V-2', name: 'Vaso 300 cc', brand: 'Darnel', categoryId: vasos.id },
      { code: 'B-1', name: 'Bolsa camiseta 40x50', brand: 'Darnel', categoryId: bolsas.id },
      { code: 'X_9', name: 'Bandeja 100% cartón', brand: null, categoryId: null },
    ]
    for (const item of items) {
      const res = await as('/products', { method: 'POST', body: JSON.stringify({ ...item, price: '10.00' }) })
      expect(res.status).toBe(201)
    }
    const { items: [inactive] } = await (await as('/products?q=V-2')).json()
    await as(`/products/${inactive.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: false }) })
  })

  it('lists every Product by name, Active and Inactive, with the total', async () => {
    expect(await names('/products')).toEqual({
      names: ['Bandeja 100% cartón', 'Bolsa camiseta 40x50', 'Vaso 180 cc', 'Vaso 300 cc'],
      total: 4,
    })
  })

  it('pages through the list with limit and offset', async () => {
    expect(await names('/products?limit=2&offset=1')).toEqual({ names: ['Bolsa camiseta 40x50', 'Vaso 180 cc'], total: 4 })
  })

  it('searches by name, Code or Brand, ignoring case', async () => {
    expect((await names('/products?q=vaso')).names).toEqual(['Vaso 180 cc', 'Vaso 300 cc'])
    expect((await names('/products?q=b-1')).names).toEqual(['Bolsa camiseta 40x50'])
    expect((await names('/products?q=darnel')).names).toEqual(['Bolsa camiseta 40x50', 'Vaso 300 cc'])
  })

  it('matches % and _ in the search literally', async () => {
    expect((await names('/products?q=100%25')).names).toEqual(['Bandeja 100% cartón'])
    expect((await names('/products?q=X_')).names).toEqual(['Bandeja 100% cartón'])
  })

  it('filters by Category', async () => {
    expect(await names(`/products?categoryId=${bolsas.id}`)).toEqual({ names: ['Bolsa camiseta 40x50'], total: 1 })
  })

  it('filters by Active status, combined with search and Category', async () => {
    expect((await names('/products?active=true')).names).toEqual(['Bandeja 100% cartón', 'Bolsa camiseta 40x50', 'Vaso 180 cc'])
    expect((await names('/products?active=false')).names).toEqual(['Vaso 300 cc'])
    expect((await names(`/products?active=true&q=vaso&categoryId=${vasos.id}`)).names).toEqual(['Vaso 180 cc'])
  })

  it('rejects an Active filter that is not true or false', async () => {
    const res = await as('/products?active=maybe')

    expect(res.status).toBe(400)
    expect((await res.json()).error.details).toHaveProperty('active')
  })
})

describe('Active and Inactive Products', () => {
  it('makes a Product Inactive and reactivates it, keeping it on record', async () => {
    const product = await createProduct({ code: 'ACT-1', name: 'Discontinuado' })

    const deactivated = await patch(`/products/${product.id}`, { isActive: false })
    const detail = await api(`/products/${product.id}`)
    const reactivated = await patch(`/products/${product.id}`, { isActive: true })

    expect(deactivated.status).toBe(200)
    expect((await deactivated.json()).isActive).toBe(false)
    expect(detail.status).toBe(200)
    expect((await detail.json()).isActive).toBe(false)
    expect((await reactivated.json()).isActive).toBe(true)
  })

  it('has no way to delete a Product', async () => {
    const product = await createProduct({ code: 'ACT-2' })

    const res = await api(`/products/${product.id}`, { method: 'DELETE' })

    expect(res.status).toBe(404)
    expect((await api(`/products/${product.id}`)).status).toBe(200)
  })
})

describe('Price changes and price history', () => {
  it('starts a new Product\'s price history with its first Price, by whoever created it', async () => {
    const product = await createProduct({ code: 'PH-1', price: '500' })

    const res = await api(`/products/${product.id}/price-history`)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      items: [{
        id: expect.any(String),
        oldPrice: null,
        newPrice: '500.00',
        changedAt: expect.any(String),
        changedBy: { id: owner.userId, fullName: null },
      }],
      total: 1,
    })
  })

  it('keeps each Price change with the old and new Price, newest first', async () => {
    const product = await createProduct({ code: 'PH-2', price: '100.00' })

    const first = await patch(`/products/${product.id}`, { price: '110.00' })
    await patch(`/products/${product.id}`, { price: '121' })
    const history = await (await api(`/products/${product.id}/price-history`)).json()

    expect((await first.json()).price).toBe('110.00')
    expect(history.total).toBe(3)
    expect(history.items.map((h: { oldPrice: string | null, newPrice: string }) => [h.oldPrice, h.newPrice])).toEqual([
      ['110.00', '121.00'],
      ['100.00', '110.00'],
      [null, '100.00'],
    ])
    expect(history.items[0].changedBy).toEqual({ id: owner.userId, fullName: null })
  })

  it('writes no history when an edit leaves the Price as it was', async () => {
    const product = await createProduct({ code: 'PH-3', price: '80.00' })

    await patch(`/products/${product.id}`, { name: 'Solo el nombre' })
    await patch(`/products/${product.id}`, { price: '80' })
    const history = await (await api(`/products/${product.id}/price-history`)).json()

    expect(history.total).toBe(1)
  })

  it('answers 404 for the price history of a Product that does not exist', async () => {
    const res = await api(`/products/${randomUUID()}/price-history`)

    expect(res.status).toBe(404)
    expect((await res.json()).error.code).toBe('product_not_found')
  })
})

describe('Products across businesses', () => {
  let other: { userId: string, businessId: string }
  let theirProduct: { id: string }
  let theirCategory: { id: string }

  beforeAll(async () => {
    other = await t.createOwnedBusiness('Negocio ajeno')
    const as = (path: string, body: unknown) =>
      t.request(path, { as: other.userId, method: 'POST', body: JSON.stringify(body) })
    theirCategory = await (await as('/categories', { name: 'Ajena' })).json()
    theirProduct = await (await as('/products', { code: 'SHARED-1', name: 'Producto ajeno', price: '1.00', categoryId: theirCategory.id })).json()
  })

  it('lets two businesses use the same Code, and each lists only its own Products', async () => {
    await createProduct({ code: 'SHARED-1', name: 'Producto propio' })

    const mine = await (await api('/products?q=SHARED-1')).json()
    const theirs = await (await t.request('/products', { as: other.userId })).json()

    expect(mine.items.map((p: { name: string }) => p.name)).toEqual(['Producto propio'])
    expect(theirs).toEqual({ items: [expect.objectContaining({ name: 'Producto ajeno' })], total: 1 })
  })

  it('answers 404 for another business\'s Product: detail, edit and price history', async () => {
    const detail = await api(`/products/${theirProduct.id}`)
    const edit = await patch(`/products/${theirProduct.id}`, { price: '0.01', isActive: false })
    const history = await api(`/products/${theirProduct.id}/price-history`)
    const untouched = await (await t.request(`/products/${theirProduct.id}`, { as: other.userId })).json()

    expect([detail.status, edit.status, history.status]).toEqual([404, 404, 404])
    expect(untouched).toMatchObject({ price: '1.00', isActive: true })
  })

  it('answers 404 for another business\'s Category on create and edit', async () => {
    const mine = await createProduct({ code: 'CAT-X' })

    const created = await post('/products', { code: 'CAT-Y', name: 'X', price: '1.00', categoryId: theirCategory.id })
    const edited = await patch(`/products/${mine.id}`, { categoryId: theirCategory.id })

    expect(created.status).toBe(404)
    expect((await created.json()).error.code).toBe('category_not_found')
    expect(edited.status).toBe(404)
    expect((await edited.json()).error.code).toBe('category_not_found')
  })

  it('refuses a business the user is not a member of with 403', async () => {
    const res = await api('/products', { headers: { 'X-Business-Id': other.businessId } })

    expect(res.status).toBe(403)
  })
})
