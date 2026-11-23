import { createProduct } from './catalog'
import { expect, test, type Page } from './fixtures'

/** A day in Argentina as `yyyy-mm-dd`, `offset` days from today. */
function dayInArgentina(offset = 0): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
    .format(new Date(Date.now() + offset * 86_400_000))
}

/** Creates a Supplier through the Suppliers screen. */
async function createSupplier(page: Page, supplier: { name: string, cuit?: string }) {
  await page.goto('/proveedores')
  await page.getByRole('button', { name: 'Nuevo proveedor' }).click()
  const dialog = page.getByRole('dialog', { name: 'Nuevo proveedor' })
  await dialog.getByRole('textbox', { name: 'Nombre' }).fill(supplier.name)
  if (supplier.cuit) await dialog.getByRole('textbox', { name: 'CUIT' }).fill(supplier.cuit)
  await dialog.getByRole('button', { name: 'Crear proveedor' }).click()
  await expect(dialog).toBeHidden()
}

/** Collects the Purchase writes the page sends, as `METHOD /path`. */
function watchPurchaseWrites(page: Page) {
  const writes: string[] = []
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname
    if (path.startsWith('/purchases') && request.method() !== 'GET' && request.method() !== 'OPTIONS') {
      writes.push(`${request.method()} ${path}`)
    }
  })
  return writes
}

/** Adds a line to the new-Purchase form: searches the Product and types quantity and unit cost. */
async function addLine(page: Page, line: { search: string, product: string, quantity: string, unitCost: string }) {
  await page.getByRole('button', { name: 'Agregar producto' }).click()
  await page.getByRole('combobox', { name: 'Buscar producto' }).fill(line.search)
  await page.getByRole('option', { name: line.product }).click()
  // The picker empties itself, ready for the next Product.
  await expect(page.getByRole('button', { name: 'Agregar producto' })).toHaveText('Agregar producto')
  const row = page.getByRole('group', { name: line.product })
  await row.getByRole('textbox', { name: 'Cantidad' }).fill(line.quantity)
  await row.getByRole('textbox', { name: 'Costo unitario' }).fill(line.unitCost)
}

test('the owner creates and edits Suppliers, and a wrong CUIT is caught', async ({ page, createOwner, signIn, openSidebar }) => {
  const userId = await createOwner('Gio Pack')
  await signIn(userId)
  await expect(page).toHaveURL('/')

  await openSidebar()
  await page.getByRole('link', { name: 'Proveedores' }).click()
  await expect(page).toHaveURL('/proveedores')
  await expect(page.getByText('Todavía no hay proveedores')).toBeVisible()

  await page.getByRole('button', { name: 'Nuevo proveedor' }).click()
  const dialog = page.getByRole('dialog', { name: 'Nuevo proveedor' })
  await dialog.getByRole('textbox', { name: 'Nombre' }).fill('Descartables del Sur')
  await dialog.getByRole('textbox', { name: 'CUIT' }).fill('20123456780')
  await expect(dialog.getByRole('textbox', { name: 'CUIT' })).toHaveValue('20-12345678-0')
  await dialog.getByRole('button', { name: 'Crear proveedor' }).click()
  await expect(dialog.getByText('El CUIT no es válido')).toBeVisible()

  await dialog.getByRole('textbox', { name: 'CUIT' }).fill('30-71234567-1')
  await dialog.getByRole('textbox', { name: 'Teléfono' }).fill('0351 4123456')
  await dialog.getByRole('button', { name: 'Crear proveedor' }).click()
  await expect(dialog).toBeHidden()

  const row = page.getByRole('button', { name: /Descartables del Sur/ })
  await expect(row).toContainText('30-71234567-1')
  await expect(row).toContainText('0351 4123456')

  await row.click()
  const edit = page.getByRole('dialog', { name: 'Editar proveedor' })
  await expect(edit.getByRole('textbox', { name: 'Nombre' })).toHaveValue('Descartables del Sur')
  await edit.getByRole('textbox', { name: 'Nombre' }).fill('Descartables del Sur SRL')
  await edit.getByRole('textbox', { name: 'Teléfono' }).fill('')
  await edit.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(edit).toBeHidden()

  const edited = page.getByRole('button', { name: /Descartables del Sur SRL/ })
  await expect(edited).toBeVisible()
  await expect(edited).not.toContainText('0351')

  await page.getByRole('searchbox', { name: 'Buscar por nombre o CUIT' }).fill('30712345671')
  await expect(edited).toBeVisible()
  await page.getByRole('searchbox', { name: 'Buscar por nombre o CUIT' }).fill('Plásticos')
  await expect(page.getByText('No encontramos proveedores')).toBeVisible()
})

test('the owner registers a Purchase and sees On-hand stock rise', { tag: '@desktop' }, async ({ page, createOwner, signIn, openSidebar, callApi }) => {
  const userId = await createOwner('Gio Pack')
  await signIn(userId)
  await expect(page).toHaveURL('/')
  // The Vaso already has 10 on hand: the Purchase must add to them.
  const vaso = await callApi(userId, 'POST', '/products', { code: 'VAS-180', name: 'Vaso térmico 180 cc x 50', price: '1500' })
  await callApi(userId, 'POST', '/stock/adjustments', { productId: vaso.id, quantity: 10, reason: 'initial_count' })
  await createProduct(page, { code: 'BAN-103', name: 'Bandeja 103', price: '500' })
  await createSupplier(page, { name: 'Descartables del Sur' })
  await createSupplier(page, { name: 'Plásticos Córdoba' })

  await openSidebar()
  await page.getByRole('link', { name: 'Compras' }).click()
  await expect(page).toHaveURL('/compras')
  await expect(page.getByText('Todavía no hay compras')).toBeVisible()
  await page.getByRole('link', { name: 'Nueva compra' }).first().click()
  await expect(page).toHaveURL('/compras/nueva')

  await page.getByRole('button', { name: 'Proveedor' }).click()
  await page.getByRole('option', { name: 'Descartables del Sur' }).click()
  await page.getByLabel('Fecha').fill('2026-11-20')
  await page.getByRole('textbox', { name: 'Número de factura' }).fill('A-0001-00012345')

  await addLine(page, { search: 'vaso', product: 'Vaso térmico 180 cc x 50', quantity: '24', unitCost: '1.000,50' })
  await addLine(page, { search: 'BAN', product: 'Bandeja 103', quantity: '1.200', unitCost: '310' })
  // 24 × 1.000,50 + 1.200 × 310 = 24.012 + 372.000
  await expect(page.getByRole('status', { name: 'Total' })).toHaveText('$ 396.012,00')
  await page.getByRole('textbox', { name: 'Notas' }).fill('Llegó con el flete de la tarde')

  // It already happened: the date picker stops at today, and a future day typed anyway is refused
  // in the form with the API's own words, before reaching it.
  const writes = watchPurchaseWrites(page)
  const date = page.getByLabel('Fecha')
  await expect(date).toHaveAttribute('max', dayInArgentina())
  await date.fill(dayInArgentina(1))
  await page.getByRole('button', { name: 'Registrar compra' }).click()
  await expect(page.getByText('La fecha de compra no puede ser futura')).toBeVisible()
  expect(writes).toEqual([])
  await date.fill('2026-11-20')

  // A double tap registers it once.
  await page.getByRole('button', { name: 'Registrar compra' }).dblclick()
  await expect(page).toHaveURL(/\/compras\/[0-9a-f-]{36}$/)
  expect(writes).toEqual(['POST /purchases'])
  await expect(page.getByText('Compra registrada', { exact: true }).first()).toBeVisible()
  const details = page.getByRole('region', { name: 'Datos de la compra' })
  await expect(details).toContainText('Descartables del Sur')
  await expect(details).toContainText('20/11/2026')
  await expect(details).toContainText('A-0001-00012345')
  await expect(details).toContainText('Llegó con el flete de la tarde')
  const lines = page.getByRole('region', { name: 'Productos' }).getByRole('listitem')
  await expect(lines).toHaveCount(2)
  await expect(lines.first()).toContainText('Vaso térmico 180 cc x 50')
  await expect(lines.first()).toContainText('24 × $ 1.000,50')
  await expect(lines.first()).toContainText('$ 24.012,00')
  await expect(page.getByRole('region', { name: 'Productos' })).toContainText(/Total\s*\$\s396\.012,00/)

  // The Purchase raised On-hand stock, and the Product's movements name it.
  await lines.first().getByRole('link', { name: 'Vaso térmico 180 cc x 50' }).click()
  const stock = page.getByRole('region', { name: 'Stock', exact: true })
  await expect(stock).toContainText('Físico 34')
  await expect(stock).toContainText('Disponible 34')
  const movements = page.getByRole('region', { name: 'Movimientos de stock' }).getByRole('listitem')
  await expect(movements.first()).toContainText('+24')
  await expect(movements.first()).toContainText('Compra · Factura A-0001-00012345')
})

test('the owner lists Purchases by Supplier and date and opens one', async ({ page, createOwner, signIn }) => {
  const userId = await createOwner('Gio Pack')
  await signIn(userId)
  await expect(page).toHaveURL('/')
  await createProduct(page, { code: 'BOL-01', name: 'Bolsa camiseta 40x50', price: '800' })
  await createSupplier(page, { name: 'Descartables del Sur' })
  await createSupplier(page, { name: 'Plásticos Córdoba' })

  for (const purchase of [
    { supplier: 'Descartables del Sur', date: '2026-11-02', quantity: '10' },
    { supplier: 'Plásticos Córdoba', date: '2026-11-15', quantity: '5' }
  ]) {
    await page.goto('/compras/nueva')
    await page.getByRole('button', { name: 'Proveedor' }).click()
    await page.getByRole('option', { name: purchase.supplier }).click()
    await page.getByLabel('Fecha').fill(purchase.date)
    await addLine(page, { search: 'bolsa', product: 'Bolsa camiseta 40x50', quantity: purchase.quantity, unitCost: '100' })
    await page.getByRole('button', { name: 'Registrar compra' }).click()
    await expect(page).toHaveURL(/\/compras\/[0-9a-f-]{36}$/)
  }

  await page.goto('/compras')
  const purchases = page.getByRole('list', { name: 'Compras' }).getByRole('link')
  await expect(purchases).toHaveCount(2)
  // Latest first.
  await expect(purchases.first()).toContainText('Plásticos Córdoba')
  await expect(purchases.first()).toContainText('15/11/2026')
  await expect(purchases.first()).toContainText('$ 500,00')
  await expect(purchases.last()).toContainText('Descartables del Sur')
  await expect(purchases.last()).toContainText('$ 1.000,00')

  await page.getByRole('button', { name: 'Proveedor' }).click()
  await page.getByRole('option', { name: 'Descartables del Sur' }).click()
  await expect(purchases).toHaveCount(1)
  await expect(page).toHaveURL(/proveedor=/)
  await expect(purchases.first()).toContainText('Descartables del Sur')

  await page.getByRole('button', { name: 'Proveedor' }).click()
  await page.getByRole('option', { name: 'Todos los proveedores' }).click()
  await expect(purchases).toHaveCount(2)
  await page.getByLabel('Desde').fill('2026-11-10')
  await expect(purchases).toHaveCount(1)
  await expect(purchases.first()).toContainText('Plásticos Córdoba')
  await page.getByLabel('Hasta').fill('2026-11-12')
  await expect(page.getByText('No encontramos compras')).toBeVisible()
  await page.getByLabel('Desde').fill('')
  await expect(purchases).toHaveCount(1)
  await expect(purchases.first()).toContainText('Descartables del Sur')

  await purchases.first().click()
  await expect(page.getByRole('region', { name: 'Datos de la compra' })).toContainText('02/11/2026')
  await expect(page.getByRole('region', { name: 'Productos' })).toContainText(/Total\s*\$\s1\.000,00/)
})
