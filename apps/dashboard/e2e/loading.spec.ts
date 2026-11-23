import { apiPath, expect, test } from './fixtures'

test('a tap answers at once on a slow connection: the page opens with placeholders and a progress bar until its data arrives', { tag: '@desktop' }, async ({ page, createOwner, signIn, createCustomer, openSidebar }) => {
  const userId = await createOwner('Gio Pack')
  await createCustomer(userId, { name: 'Kiosco La Esquina', branches: [{ address: 'San Martín 100', city: 'Corral de Bustos' }] })
  await signIn(userId)
  await expect(page).toHaveURL('/')

  // Hold the Customer list until the test lets it through, as a slow API would.
  let release!: () => void
  const released = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route(url => apiPath(url.href) === '/customers', async (route) => {
    await released
    await route.continue()
  })

  await openSidebar()
  await page.getByRole('link', { name: 'Clientes' }).click()

  await expect(page).toHaveURL('/clientes')
  await expect(page.getByRole('heading', { name: 'Clientes' })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'Cargando…' })).toBeAttached()
  await expect(page.getByRole('progressbar')).toBeVisible()

  release()
  await expect(page.getByRole('link', { name: /Kiosco La Esquina/ })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'Cargando…' })).toHaveCount(0)
  await expect(page.getByRole('progressbar')).toHaveCount(0)
})
