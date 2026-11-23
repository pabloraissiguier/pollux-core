import { dayInArgentina, expect, test } from './fixtures'

/** `yyyy-mm-dd` → `dd/mm/yyyy`, written out by hand as the expected text. */
function shown(day: string): string {
  const [y, m, d] = day.split('-')
  return `${d}/${m}/${y}`
}

interface CustomerWithBranches { id: string, branches: { id: string }[] }

const branch = { address: 'San Martín 100', city: 'Corral de Bustos' }

test('a Pending Order for more than there is shows on Inicio and on the Order, until stock is raised', { tag: '@desktop' }, async ({ page, createOwner, signIn, callApi }) => {
  const userId = await createOwner('Gio Pack')
  const vaso = await callApi(userId, 'POST', '/products', { code: 'VAS-180', name: 'Vaso térmico 180 cc', price: '1000' })
  const bandeja = await callApi(userId, 'POST', '/products', { code: 'BAN-103', name: 'Bandeja 103', price: '500' })
  await callApi(userId, 'POST', '/stock/adjustments', { productId: vaso.id, quantity: 5, reason: 'initial_count' })
  await callApi(userId, 'POST', '/stock/adjustments', { productId: bandeja.id, quantity: 50, reason: 'initial_count' })
  const kiosco = await callApi<CustomerWithBranches>(userId, 'POST', '/customers', { name: 'Kiosco La Esquina', branches: [branch] })
  const tomorrow = dayInArgentina(1)
  const order = await callApi(userId, 'POST', '/orders', {
    customerId: kiosco.id,
    branchId: kiosco.branches[0]!.id,
    deliveryDate: tomorrow,
    lines: [{ productId: vaso.id, quantity: 8 }, { productId: bandeja.id, quantity: 2 }]
  })
  await signIn(userId)
  await expect(page).toHaveURL('/')

  // Inicio: the short Product, what is missing and the Order that reserves it.
  const alert = page.getByRole('region', { name: 'Stock a reponer' })
  await expect(alert).toBeVisible()
  await expect(alert.getByRole('link', { name: /Vaso térmico 180 cc/ })).toHaveAttribute('href', `/productos/${vaso.id}`)
  await expect(alert).toContainText('VAS-180')
  await expect(alert).toContainText('Sin stock suficiente: disponible -3, faltan 3')
  await expect(alert).not.toContainText('Bandeja 103')
  const orderLink = alert.getByRole('link', { name: /N° 1/ })
  await expect(orderLink).toContainText('Kiosco La Esquina')
  await expect(orderLink).toContainText(shown(tomorrow))

  // The Order detail marks the short line only, by icon and text.
  await orderLink.click()
  await expect(page).toHaveURL(`/pedidos/${order.id}`)
  const lines = page.getByRole('region', { name: 'Productos' }).getByRole('listitem')
  const vasoLine = lines.filter({ hasText: 'Vaso térmico 180 cc' })
  await expect(vasoLine).toContainText('Sin stock suficiente: disponible -3, faltan 3')
  await expect(lines.filter({ hasText: 'Bandeja 103' })).not.toContainText('Sin stock suficiente')
  // Never a block: the Order can still be edited and delivered.
  await expect(page.getByRole('link', { name: 'Editar' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Entregar' })).toBeEnabled()

  // A Stock adjustment fixes the shortage: on the next load nothing is left to warn about.
  await callApi(userId, 'POST', '/stock/adjustments', { productId: vaso.id, quantity: 3, reason: 'count_correction' })
  await page.reload()
  await expect(page.getByRole('region', { name: 'Productos' })).toContainText('Vaso térmico 180 cc')
  await expect(page.getByText('Sin stock suficiente')).toHaveCount(0)
  await page.goto('/')
  await expect(page.getByRole('status', { name: 'Saldo total' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Stock a reponer' })).toHaveCount(0)
})

test('a Delivered or Cancelled Order shows no stock warning, even with its Product short', async ({ page, createOwner, signIn, callApi }) => {
  const userId = await createOwner('Gio Pack')
  const vaso = await callApi(userId, 'POST', '/products', { code: 'VAS-180', name: 'Vaso térmico 180 cc', price: '1000' })
  const kiosco = await callApi<CustomerWithBranches>(userId, 'POST', '/customers', { name: 'Kiosco La Esquina', branches: [branch] })
  const newOrder = () => callApi(userId, 'POST', '/orders', {
    customerId: kiosco.id,
    branchId: kiosco.branches[0]!.id,
    deliveryDate: dayInArgentina(1),
    lines: [{ productId: vaso.id, quantity: 8 }]
  })
  const delivered = await newOrder()
  await callApi(userId, 'POST', `/orders/${delivered.id}/deliver`, {})
  const cancelled = await newOrder()
  await callApi(userId, 'POST', `/orders/${cancelled.id}/cancel`)
  // Still Pending and short, so the Product is short for sure while the other two are viewed.
  const pending = await newOrder()
  await signIn(userId)
  await expect(page).toHaveURL('/')

  await page.goto(`/pedidos/${pending.id}`)
  await expect(page.getByRole('region', { name: 'Productos' })).toContainText('Sin stock suficiente')

  for (const order of [delivered, cancelled]) {
    await page.goto(`/pedidos/${order.id}`)
    await expect(page.getByRole('region', { name: 'Productos' })).toContainText('Vaso térmico 180 cc')
    await expect(page.getByText('Sin stock suficiente')).toHaveCount(0)
  }
})
