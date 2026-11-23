import { createProduct } from './catalog'
import { apiPath, expect, test, type Page } from './fixtures'

/** Records a Stock adjustment from the Product page, through the "Ajustar stock" sheet. */
async function adjustStock(page: Page, adjustment: { direction: 'Sumar' | 'Restar', quantity: string, reason: string, notes?: string }) {
  await page.getByRole('button', { name: 'Ajustar stock' }).click()
  const dialog = page.getByRole('dialog', { name: 'Ajustar stock' })
  await dialog.getByRole('radio', { name: adjustment.direction }).check()
  await dialog.getByRole('textbox', { name: 'Cantidad' }).fill(adjustment.quantity)
  await dialog.getByRole('radio', { name: adjustment.reason }).check()
  if (adjustment.notes) await dialog.getByRole('textbox', { name: 'Notas' }).fill(adjustment.notes)
  await dialog.getByRole('button', { name: 'Guardar ajuste' }).click()
  await expect(dialog).toBeHidden()
}

test('the owner adjusts a Product\'s stock and sees On-hand change, with the movement and its cause', { tag: '@desktop' }, async ({ page, createOwner, signIn }) => {
  const userId = await createOwner('Gio Pack')
  await signIn(userId)
  await expect(page).toHaveURL('/')
  await createProduct(page, { code: 'VAS-180', name: 'Vaso térmico 180 cc x 50', price: '1234,50' })

  const stock = page.getByRole('region', { name: 'Stock', exact: true })
  await expect(stock.getByRole('definition').nth(0)).toHaveText('0')

  await adjustStock(page, { direction: 'Sumar', quantity: '24', reason: 'Conteo inicial' })
  await expect(stock).toContainText('Físico 24')
  await expect(stock).toContainText('Reservado 0')
  await expect(stock).toContainText('Disponible 24')

  await adjustStock(page, { direction: 'Restar', quantity: '3', reason: 'Rotura', notes: 'Se cayó una caja' })
  await expect(stock).toContainText('Físico 21')
  await expect(stock).toContainText('Disponible 21')

  // Newest first, each with its signed quantity and its cause.
  const movements = page.getByRole('region', { name: 'Movimientos de stock' }).getByRole('listitem')
  await expect(movements).toHaveCount(2)
  await expect(movements.first()).toContainText('-3')
  await expect(movements.first()).toContainText('Ajuste de stock · Rotura')
  await expect(movements.first()).toContainText('Se cayó una caja')
  await expect(movements.last()).toContainText('+24')
  await expect(movements.last()).toContainText('Ajuste de stock · Conteo inicial')
})

test('the catalog and the Product page show On-hand, Reserved and Available stock, and a shortage stands out', async ({ page, createOwner, signIn }) => {
  const userId = await createOwner('Gio Pack')
  await signIn(userId)
  await expect(page).toHaveURL('/')
  await createProduct(page, { code: 'BOL-01', name: 'Bolsa camiseta 40x50', price: '800' })
  await adjustStock(page, { direction: 'Restar', quantity: '5', reason: 'Corrección de conteo' })

  const stock = page.getByRole('region', { name: 'Stock', exact: true })
  await expect(stock).toContainText('Disponible -5')
  await expect(stock).toContainText('Stock disponible negativo: faltan 5 unidades.')

  await createProduct(page, { code: 'BOL-02', name: 'Bolsa camiseta 45x60', price: '900' })
  await adjustStock(page, { direction: 'Sumar', quantity: '1.200', reason: 'Conteo inicial' })
  await expect(stock).toContainText('Físico 1.200')

  await page.goto('/productos')
  // A shortage carries a warning icon with its own name, not just a color.
  const short = page.getByRole('link', { name: /Bolsa camiseta 40x50/ })
  await expect(short).toContainText('Físico -5 · Reservado 0')
  await expect(short).toContainText('Disponible -5')
  await expect(short.getByRole('img', { name: 'Stock disponible negativo' })).toBeVisible()

  const stocked = page.getByRole('link', { name: /Bolsa camiseta 45x60/ })
  await expect(stocked).toContainText('Físico 1.200 · Reservado 0')
  await expect(stocked).toContainText('Disponible 1.200')
  await expect(stocked.getByRole('img', { name: 'Stock disponible negativo' })).toHaveCount(0)
})

test('the owner types counted quantities for several Products and saves them in one request', { tag: '@desktop' }, async ({ page, createOwner, signIn }) => {
  const userId = await createOwner('Gio Pack')
  await signIn(userId)
  await expect(page).toHaveURL('/')
  await createProduct(page, { code: 'VAS-180', name: 'Vaso térmico 180 cc', price: '1000' })
  await createProduct(page, { code: 'BAN-1', name: 'Bandeja 103', price: '500' })
  await adjustStock(page, { direction: 'Sumar', quantity: '10', reason: 'Conteo inicial' })
  await createProduct(page, { code: 'LAV-1', name: 'Lavandina 1 L', price: '950' })

  // Reached from the catalog.
  await page.goto('/productos')
  await page.getByRole('link', { name: 'Conteo inicial' }).click()
  await expect(page.getByRole('heading', { name: 'Conteo inicial', level: 1 })).toBeVisible()
  const save = page.getByRole('button', { name: /Guardar conteo/ })
  await expect(save).toBeDisabled()

  // A count that isn't a whole number is refused before asking the API.
  const vasos = page.getByRole('textbox', { name: 'Contado de Vaso térmico 180 cc' })
  await vasos.fill('2,5')
  await expect(page.getByText('Ingresá un número entero, sin signo ni decimales')).toBeVisible()
  await vasos.fill('1.200')

  // Searching narrows the list but keeps what was already typed.
  const search = page.getByRole('searchbox', { name: 'Buscar por nombre, código o marca' })
  await search.fill('bandeja')
  await expect(vasos).toHaveCount(0)
  await page.getByRole('textbox', { name: 'Contado de Bandeja 103' }).fill('7')
  await search.fill('')
  await expect(vasos).toHaveValue('1.200')
  await expect(save).toHaveText('Guardar conteo (2)')
  // Typing then searching right away doesn't leave the old error on the fixed count.
  await expect(page.getByText('Ingresá un número entero, sin signo ni decimales')).toBeHidden()

  const stockRequests: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/stock/')) stockRequests.push(`${request.method()} ${apiPath(request.url())}`)
  })
  await save.click()
  await expect(page.getByText('Conteo guardado', { exact: true })).toBeVisible()
  expect(stockRequests).toEqual(['POST /stock/initial-count'])

  // The list shows the new On-hand stock and clears the typed counts.
  await expect(vasos).toHaveValue('')
  const rows = page.getByRole('region', { name: 'Productos a contar' }).getByRole('listitem')
  await expect(rows.filter({ hasText: 'Vaso térmico 180 cc' })).toContainText('Físico 1.200')
  await expect(rows.filter({ hasText: 'Bandeja 103' })).toContainText('Físico 7')
  await expect(rows.filter({ hasText: 'Lavandina 1 L' })).toContainText('Físico 0')

  // Each counted Product records the difference as an initial-count adjustment.
  await page.goto('/productos')
  await page.getByRole('link', { name: /Bandeja 103/ }).click()
  const movements = page.getByRole('region', { name: 'Movimientos de stock' }).getByRole('listitem')
  await expect(movements).toHaveCount(2)
  await expect(movements.first()).toContainText('-3')
  await expect(movements.first()).toContainText('Ajuste de stock · Conteo inicial')
})
