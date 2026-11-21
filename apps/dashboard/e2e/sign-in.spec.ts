import { expect, test } from './fixtures'

test('the owner signs in and lands on Inicio of their business', { tag: '@desktop' }, async ({ page, createOwner, signIn, openSidebar }) => {
  const userId = await createOwner('Gio Pack')

  await signIn(userId)

  await expect(page).toHaveURL('/')
  await expect(page.getByRole('heading', { name: 'Inicio', level: 1 })).toBeVisible()
  await openSidebar()
  await expect(page.getByText('Gio Pack').filter({ visible: true })).toBeVisible()
})

test('a signed-out visit goes to sign-in and comes back to the same page', async ({ page, createOwner, signIn }) => {
  const userId = await createOwner('Gio Pack')

  await page.goto('/clientes')
  await expect(page).toHaveURL('/login?redirect=/clientes')

  await signIn(userId, { from: 'here' })

  await expect(page).toHaveURL('/clientes')
  await expect(page.getByRole('heading', { name: 'Clientes', level: 1 })).toBeVisible()
})

test('the session survives a reload and a new visit', async ({ page, context, createOwner, signIn }) => {
  const userId = await createOwner('Gio Pack')
  await signIn(userId)
  await expect(page).toHaveURL('/')

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Inicio', level: 1 })).toBeVisible()

  const later = await context.newPage()
  await later.goto('/productos')
  await expect(later).toHaveURL('/productos')
  await expect(later.getByRole('heading', { name: 'Productos', level: 1 })).toBeVisible()
})

test('signing out from the sidebar ends the session', async ({ page, createOwner, signIn, openSidebar }) => {
  const userId = await createOwner('Gio Pack')
  await signIn(userId)
  await expect(page).toHaveURL('/')

  await openSidebar()
  await page.getByRole('button', { name: 'Cerrar sesión' }).click()

  await expect(page).toHaveURL('/login')
  await page.goto('/pedidos')
  await expect(page).toHaveURL('/login?redirect=/pedidos')
})

test('an expired or rejected session sends the owner back to sign-in, keeping the page', async ({ page, signIn }) => {
  await page.goto('/clientes')
  // The API's test verifier only accepts a user id, so this token is rejected with a 401.
  await signIn('not-a-user-id', { from: 'here' })

  await expect(page).toHaveURL('/login?redirect=/clientes')
  await expect(page.getByText('Iniciá sesión para continuar', { exact: true })).toBeVisible()
})
