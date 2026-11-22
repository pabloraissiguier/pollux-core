import { expect, test } from './fixtures'

/** Today in Argentina as `yyyy-mm-dd`, the Delivered date a delivery starts with. */
function todayInArgentina(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date())
}

/** `yyyy-mm-dd` → `dd/mm/yyyy`, as the app shows it. */
function shown(day: string): string {
  const [y, m, d] = day.split('-')
  return `${d}/${m}/${y}`
}

interface CustomerWithBranches { id: string, branches: { id: string }[] }

type CallApi = <T = { id: string }>(userId: string, method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown) => Promise<T>

/** A Customer with one Branch in `city`, through the API. */
async function customerIn(callApi: CallApi, userId: string, name: string, city: string) {
  return callApi<CustomerWithBranches>(userId, 'POST', '/customers', { name, branches: [{ address: 'San Martín 100', city }] })
}

/** A Pending Order for `quantity` units of the Product, to deliver on `deliveryDate`. */
async function orderFor(callApi: CallApi, userId: string, customer: CustomerWithBranches, productId: string, quantity: number, deliveryDate: string) {
  return callApi<{ id: string, number: number }>(userId, 'POST', '/orders', {
    customerId: customer.id,
    branchId: customer.branches[0]!.id,
    deliveryDate,
    lines: [{ productId, quantity }]
  })
}

test('the owner follows the reparto by town and delivers an Order on account straight from the list', { tag: '@desktop' }, async ({ page, createOwner, signIn, callApi }) => {
  const userId = await createOwner('Gio Pack')
  const today = todayInArgentina()
  const vaso = await callApi(userId, 'POST', '/products', { code: 'VAS-180', name: 'Vaso térmico 180 cc', price: '1000' })
  const kiosco = await customerIn(callApi, userId, 'Kiosco La Esquina', 'Corral de Bustos')
  const almacen = await customerIn(callApi, userId, 'Almacén Don Pepe', 'Corral de Bustos')
  const despensa = await customerIn(callApi, userId, 'Despensa Isla', 'Isla Verde')
  await orderFor(callApi, userId, kiosco, vaso.id, 2, today)
  await orderFor(callApi, userId, almacen, vaso.id, 3, today)
  await orderFor(callApi, userId, despensa, vaso.id, 1, today)
  await signIn(userId)
  await expect(page).toHaveURL('/')

  await page.goto('/pedidos')
  await page.getByRole('link', { name: 'Reparto' }).click()
  await expect(page).toHaveURL(/\/pedidos\/reparto/)
  await expect(page.getByLabel('Fecha de reparto')).toHaveValue(today)

  // One group per town, each with its Orders and their total.
  const corral = page.getByRole('region', { name: 'Corral de Bustos' })
  const isla = page.getByRole('region', { name: 'Isla Verde' })
  await expect(corral).toContainText('2 pedidos')
  await expect(corral).toContainText('$ 5.000,00')
  await expect(corral.getByRole('listitem')).toHaveCount(2)
  await expect(isla).toContainText('1 pedido')
  await expect(isla).toContainText('$ 1.000,00')

  // Delivering from the list: the sheet shows the total and today's date, on account by default.
  await corral.getByRole('listitem').filter({ hasText: 'Kiosco La Esquina' }).getByRole('button', { name: 'Entregar' }).click()
  const sheet = page.getByRole('dialog', { name: /Entregar pedido N° \d+/ })
  await expect(sheet).toContainText('$ 2.000,00')
  await expect(sheet.getByLabel('Fecha entregada')).toHaveValue(today)
  await expect(sheet.getByRole('radio', { name: 'Cuenta corriente (sin pago)' })).toBeChecked()
  await sheet.getByRole('button', { name: 'Confirmar entrega' }).click()

  // Success shows the Customer's new Balance.
  await expect(sheet).toContainText('Pedido entregado')
  await expect(sheet.getByRole('status', { name: 'Saldo de Kiosco La Esquina' })).toHaveText('$ 2.000,00')
  await sheet.getByRole('button', { name: 'Listo' }).click()
  await expect(sheet).toBeHidden()

  // The list shows it Delivered, without a deliver button.
  const kioscoRow = corral.getByRole('listitem').filter({ hasText: 'Kiosco La Esquina' })
  await expect(kioscoRow).toContainText('Entregado')
  await expect(kioscoRow.getByRole('button', { name: 'Entregar' })).toHaveCount(0)
  await expect(corral.getByRole('listitem').filter({ hasText: 'Almacén Don Pepe' }).getByRole('button', { name: 'Entregar' })).toBeVisible()
})

test('the owner delivers an Order on account, checks the Balance and statement, and undoes the delivery', async ({ page, createOwner, signIn, callApi }) => {
  const userId = await createOwner('Gio Pack')
  const today = todayInArgentina()
  const vaso = await callApi(userId, 'POST', '/products', { code: 'VAS-180', name: 'Vaso térmico 180 cc', price: '1234.50' })
  const kiosco = await customerIn(callApi, userId, 'Kiosco La Esquina', 'Corral de Bustos')
  await callApi(userId, 'POST', `/customers/${kiosco.id}/opening-balance`, { amount: '500.00', entryDate: '2026-01-10' })
  const order = await orderFor(callApi, userId, kiosco, vaso.id, 2, today)
  await signIn(userId)
  await expect(page).toHaveURL('/')

  // Deliver from the Order's page.
  await page.goto(`/pedidos/${order.id}`)
  await page.getByRole('button', { name: 'Entregar' }).click()
  const sheet = page.getByRole('dialog', { name: `Entregar pedido N° ${order.number}` })
  await expect(sheet).toContainText('$ 2.469,00')
  await sheet.getByRole('button', { name: 'Confirmar entrega' }).click()
  await expect(sheet.getByRole('status', { name: 'Saldo de Kiosco La Esquina' })).toHaveText('$ 2.969,00')
  await sheet.getByRole('button', { name: 'Listo' }).click()
  await expect(page.getByText('Fecha entregada')).toBeVisible()
  await expect(page.getByText('Entregado', { exact: true })).toBeVisible()

  // The Customer's page: the Balance up front, and the recent Orders.
  await page.getByRole('link', { name: 'Kiosco La Esquina' }).click()
  await expect(page.getByRole('status', { name: 'Saldo' })).toHaveText('$ 2.969,00')
  const recent = page.getByRole('region', { name: 'Pedidos recientes' })
  await expect(recent.getByRole('link', { name: new RegExp(`N° ${order.number}`) })).toContainText('$ 2.469,00')

  // The statement: debe/haber with a running Balance, in plain Spanish.
  await page.getByRole('link', { name: 'Ver resumen de cuenta' }).click()
  await expect(page).toHaveURL(`/cuentas-corrientes/${kiosco.id}`)
  const entries = page.getByRole('list', { name: 'Movimientos de cuenta' }).getByRole('listitem')
  await expect(entries).toHaveCount(2)
  await expect(entries.nth(0)).toContainText('Saldo inicial')
  await expect(entries.nth(0)).toContainText('10/01/2026')
  await expect(entries.nth(0)).toContainText('Debe $ 500,00')
  await expect(entries.nth(0)).toContainText('Saldo $ 500,00')
  await expect(entries.nth(1)).toContainText(`Entrega pedido N° ${order.number}`)
  await expect(entries.nth(1)).toContainText(shown(today))
  await expect(entries.nth(1)).toContainText('Debe $ 2.469,00')
  await expect(entries.nth(1)).toContainText('Saldo $ 2.969,00')

  // A date range leaves earlier entries out, while the running Balance still counts them.
  await page.getByLabel('Desde').fill('2026-02-01')
  await expect(entries).toHaveCount(1)
  await expect(entries.nth(0)).toContainText('Saldo $ 2.969,00')
  await expect(page).toHaveURL(/desde=2026-02-01/)
  await page.getByLabel('Hasta').fill('2026-02-28')
  await expect(page.getByText('No hay movimientos en estas fechas')).toBeVisible()

  // Undo the delivery: the confirmation says Payments stay.
  await page.goto(`/pedidos/${order.id}`)
  await page.getByRole('button', { name: 'Deshacer entrega' }).click()
  const confirm = page.getByRole('dialog', { name: `¿Deshacer la entrega del pedido N° ${order.number}?` })
  await expect(confirm).toContainText('Los pagos registrados no se anulan')
  await confirm.getByRole('button', { name: 'Sí, deshacer entrega' }).click()
  await expect(confirm).toBeHidden()
  await expect(page.getByText('Pendiente', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Entregar' })).toBeVisible()

  // The statement shows the reversal, and the Balance is back to the Opening balance.
  await page.goto(`/cuentas-corrientes/${kiosco.id}`)
  await expect(entries).toHaveCount(3)
  await expect(entries.nth(2)).toContainText(`Entrega deshecha, pedido N° ${order.number}`)
  await expect(entries.nth(2)).toContainText('Haber $ 2.469,00')
  await expect(entries.nth(2)).toContainText('Saldo $ 500,00')
  await expect(page.getByRole('status', { name: 'Saldo' })).toHaveText('$ 500,00')
})
