import { expect, test } from './fixtures'

test('an owner of several businesses picks one after signing in', async ({ page, createOwner, signIn, openSidebar }) => {
  const userId = await createOwner('Gio Pack', 'Distribuidora Sur')

  await signIn(userId)
  await expect(page).toHaveURL('/negocio')
  await page.getByRole('button', { name: 'Distribuidora Sur' }).click()

  await expect(page).toHaveURL('/')
  await openSidebar()
  await expect(page.getByRole('button', { name: /Negocio: Distribuidora Sur/ })).toBeVisible()
})

test('the business switcher changes the business, and the device remembers it', { tag: '@desktop' }, async ({ page, createOwner, signIn, openSidebar }) => {
  const userId = await createOwner('Gio Pack', 'Distribuidora Sur')
  await signIn(userId)
  await page.getByRole('button', { name: 'Distribuidora Sur' }).click()
  await expect(page).toHaveURL('/')

  await openSidebar()
  await page.getByRole('button', { name: /Cambiar de negocio/ }).click()
  await page.getByRole('menuitemcheckbox', { name: 'Gio Pack' }).click()

  await page.reload()
  await openSidebar()
  await expect(page.getByRole('button', { name: /Negocio: Gio Pack/ })).toBeVisible()

  // Signing in again on the same device skips the picker.
  await page.getByRole('button', { name: 'Cerrar sesión' }).click()
  await signIn(userId)
  await expect(page).toHaveURL('/')
  await openSidebar()
  await expect(page.getByRole('button', { name: /Negocio: Gio Pack/ })).toBeVisible()
})

test('losing access to the chosen business sends the owner to the picker', async ({ page, createOwner, signIn, removeMembership }) => {
  const userId = await createOwner('Gio Pack', 'Distribuidora Sur', 'Mayorista Norte')
  await signIn(userId)
  await page.getByRole('button', { name: 'Distribuidora Sur' }).click()
  await expect(page).toHaveURL('/')

  await removeMembership(userId, 'Distribuidora Sur')
  await page.reload()

  await expect(page).toHaveURL('/negocio')
  await expect(page.getByRole('button', { name: 'Distribuidora Sur' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Gio Pack' })).toBeVisible()
})

test('after picking a business the owner gets to the page they asked for', async ({ page, createOwner, signIn }) => {
  const userId = await createOwner('Gio Pack', 'Distribuidora Sur')

  await page.goto('/productos')
  await signIn(userId, { from: 'here' })
  await expect(page).toHaveURL('/negocio?redirect=/productos')
  await page.getByRole('button', { name: 'Gio Pack' }).click()

  await expect(page).toHaveURL('/productos')
})

test('another user signing in on the same device picks their own business', async ({ page, createOwner, signIn }) => {
  const first = await createOwner('Gio Pack', 'Distribuidora Sur')
  await signIn(first)
  await page.getByRole('button', { name: 'Distribuidora Sur' }).click()
  await expect(page).toHaveURL('/')
  await page.goto('/negocio')
  await page.getByRole('button', { name: 'Cerrar sesión' }).click()

  const second = await createOwner('Almacén Centro', 'Kiosco Oeste')
  await signIn(second)

  await expect(page).toHaveURL('/negocio')
  await expect(page.getByRole('button', { name: 'Almacén Centro' })).toBeVisible()
  await expect(page.getByText('No tenés acceso a este negocio', { exact: true })).toHaveCount(0)
})
