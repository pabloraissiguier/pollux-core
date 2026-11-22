import { expect, test } from './fixtures'

/** Today in Argentina as `dd/mm/yyyy`, the day the Delivery note is issued. */
function issuedToday(): string {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date()).split('-')
  return `${d}/${m}/${y}`
}

interface CustomerWithBranches { id: string, branches: { id: string }[] }

test('the owner prints a Delivery note and a reprint keeps its number', { tag: '@desktop' }, async ({ page, createOwner, signIn, callApi }) => {
  const userId = await createOwner('Gio Pack')
  const vaso = await callApi(userId, 'POST', '/products', { code: 'VAS-180', name: 'Vaso térmico 180 cc', price: '1000' })
  const tapa = await callApi(userId, 'POST', '/products', { code: 'TAP-180', name: 'Tapa 180 cc', price: '200' })
  const kiosco = await callApi<CustomerWithBranches>(userId, 'POST', '/customers', {
    name: 'Kiosco La Esquina',
    cuit: '33693450239',
    branches: [{ name: 'Centro', address: 'San Martín 100', city: 'Corral de Bustos' }]
  })
  // Another Order takes the first number, so this one's isn't just "1".
  const first = await callApi(userId, 'POST', '/orders', {
    customerId: kiosco.id, branchId: kiosco.branches[0]!.id, deliveryDate: '2026-03-10', lines: [{ productId: tapa.id, quantity: 1 }]
  })
  await callApi(userId, 'POST', `/orders/${first.id}/delivery-note`)
  const order = await callApi<{ id: string, number: number }>(userId, 'POST', '/orders', {
    customerId: kiosco.id,
    branchId: kiosco.branches[0]!.id,
    deliveryDate: '2026-03-10',
    discountPercent: '10',
    lines: [{ productId: vaso.id, quantity: 3, discountPercent: '5' }, { productId: tapa.id, quantity: 10 }]
  })
  // The print dialog can't be driven in a test: count the calls instead.
  await page.addInitScript(() => {
    const w = window as unknown as { printed: number }
    w.printed = 0
    window.print = () => {
      w.printed++
    }
  })
  await signIn(userId)
  await expect(page).toHaveURL('/')

  await page.goto(`/pedidos/${order.id}`)
  await page.getByRole('link', { name: 'Imprimir remito' }).click()
  await expect(page).toHaveURL(`/pedidos/${order.id}/remito`)

  // A chrome-free sheet: the business, the number, the Customer and Branch, the lines and the total.
  await expect(page.getByRole('heading', { name: 'Remito N° 2' })).toBeVisible()
  await expect(page.getByRole('navigation')).toHaveCount(0)
  // A business without its own data prints only its name as the issuer, with no blank lines.
  await expect(page.getByRole('region', { name: 'Emisor' })).toHaveText('Gio Pack')
  await expect(page.getByText(`Pedido N° ${order.number}`)).toBeVisible()
  await expect(page.getByText('Kiosco La Esquina')).toBeVisible()
  await expect(page.getByText('CUIT 33-69345023-9')).toBeVisible()
  await expect(page.getByText('Centro · San Martín 100, Corral de Bustos')).toBeVisible()
  await expect(page.getByText(`Fecha ${issuedToday()}`)).toBeVisible()
  await expect(page.getByText('10/03/2026')).toBeVisible()

  const rows = page.getByRole('table', { name: 'Productos' }).getByRole('row')
  await expect(rows).toHaveCount(3)
  await expect(rows.nth(1)).toContainText('VAS-180')
  await expect(rows.nth(1)).toContainText('Vaso térmico 180 cc')
  await expect(rows.nth(1)).toContainText('$ 1.000,00')
  await expect(rows.nth(1)).toContainText('5 %')
  await expect(rows.nth(1)).toContainText('$ 2.850,00')
  await expect(rows.nth(2)).toContainText('Tapa 180 cc')
  await expect(rows.nth(2)).toContainText('$ 2.000,00')
  await expect(page.getByText('Descuento del pedido (10 %)')).toBeVisible()
  await expect(page.getByRole('status', { name: 'Total' })).toHaveText('$ 4.365,00')

  // It opens the print dialog by itself, and again on demand.
  await expect.poll(() => page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(1)
  await page.getByRole('button', { name: 'Imprimir' }).click()
  await expect.poll(() => page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(2)

  // The Order now shows its number, and printing again keeps it.
  await page.getByRole('link', { name: 'Volver al pedido' }).click()
  await expect(page).toHaveURL(`/pedidos/${order.id}`)
  await expect(page.getByText('N° 2', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Reimprimir remito' }).click()
  await expect(page.getByRole('heading', { name: 'Remito N° 2' })).toBeVisible()
  // The app doesn't reload on the way back, so the count goes on: the reprint opened the dialog too.
  await expect.poll(() => page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(3)

  // A fresh load of the print view still shows the same number.
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Remito N° 2' })).toBeVisible()
})

test('the Delivery note prints the business\'s own data as the issuer', async ({ page, createOwner, signIn, callApi }) => {
  const userId = await createOwner('Gio Pack')
  await callApi(userId, 'PATCH', '/business', {
    legalName: 'Gio Pack S.R.L.',
    cuit: '30712345671',
    vatCondition: 'responsable_inscripto',
    address: 'San Martín 450',
    city: 'Corral de Bustos',
    province: 'Córdoba',
    postalCode: '2645',
    phone: '03468 15-123456',
    grossIncomeNumber: '280-123456-7',
    activityStartDate: '2015-03-01'
  })
  const vaso = await callApi(userId, 'POST', '/products', { code: 'VAS-180', name: 'Vaso térmico 180 cc', price: '1000' })
  const kiosco = await callApi<CustomerWithBranches>(userId, 'POST', '/customers', {
    name: 'Kiosco La Esquina',
    branches: [{ address: 'Belgrano 20', city: 'Cruz Alta' }]
  })
  const order = await callApi(userId, 'POST', '/orders', {
    customerId: kiosco.id, branchId: kiosco.branches[0]!.id, deliveryDate: '2026-03-10', lines: [{ productId: vaso.id, quantity: 1 }]
  })
  await page.addInitScript(() => {
    window.print = () => {}
  })
  await signIn(userId)
  await expect(page).toHaveURL('/')

  await page.goto(`/pedidos/${order.id}/remito`)
  await expect(page.getByRole('heading', { name: 'Remito N° 1' })).toBeVisible()
  const issuer = page.getByRole('region', { name: 'Emisor' })
  // The razón social stands in for the name, then every filled field with its Spanish label.
  await expect(issuer.getByText('Gio Pack S.R.L.', { exact: true })).toBeVisible()
  await expect(issuer.getByText('Domicilio San Martín 450, Corral de Bustos, Córdoba (CP 2645)')).toBeVisible()
  await expect(issuer.getByText('Teléfono 03468 15-123456')).toBeVisible()
  await expect(issuer.getByText('CUIT 30-71234567-1')).toBeVisible()
  await expect(issuer.getByText('Condición frente al IVA Responsable Inscripto')).toBeVisible()
  await expect(issuer.getByText('Ingresos Brutos 280-123456-7')).toBeVisible()
  await expect(issuer.getByText('Inicio de actividades 01/03/2015')).toBeVisible()
})
