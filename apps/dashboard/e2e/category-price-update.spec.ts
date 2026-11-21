import { expect, test, type Page } from './fixtures'

async function createCategory(page: Page, name: string) {
  await page.goto('/productos/categorias')
  await page.getByRole('button', { name: 'Nueva categoría' }).click()
  const dialog = page.getByRole('dialog', { name: 'Nueva categoría' })
  await dialog.getByRole('textbox', { name: 'Nombre' }).fill(name)
  await dialog.getByRole('button', { name: 'Crear categoría' }).click()
  await expect(page.getByRole('link', { name, exact: true })).toBeVisible()
}

async function createProduct(page: Page, product: { code: string, name: string, category: string, price: string }) {
  await page.goto('/productos/nuevo')
  await page.getByRole('textbox', { name: 'Código' }).fill(product.code)
  await page.getByRole('textbox', { name: 'Nombre' }).fill(product.name)
  await page.getByRole('button', { name: 'Categoría' }).click()
  await page.getByRole('option', { name: product.category }).click()
  await page.getByRole('textbox', { name: 'Precio' }).fill(product.price)
  await page.getByRole('button', { name: 'Crear producto' }).click()
  await expect(page.getByRole('heading', { name: product.name, level: 1 })).toBeVisible()
}

test('the owner previews a Category Price update, cancels it, then applies it', { tag: '@desktop' }, async ({ page, createOwner, signIn }) => {
  const userId = await createOwner('Gio Pack')
  await signIn(userId)
  await expect(page).toHaveURL('/')
  await createCategory(page, 'Descartables')
  await createCategory(page, 'Limpieza')
  await createProduct(page, { code: 'VAS-180', name: 'Vaso térmico 180 cc', category: 'Descartables', price: '1000' })
  await createProduct(page, { code: 'BAN-1', name: 'Bandeja 103', category: 'Descartables', price: '333,33' })
  await createProduct(page, { code: 'LAV-1', name: 'Lavandina 1 L', category: 'Limpieza', price: '950' })

  // From the Categories screen, the Category comes already picked.
  await page.goto('/productos/categorias')
  await page.getByRole('link', { name: 'Actualizar precios de Descartables' }).click()
  await expect(page.getByRole('heading', { name: 'Actualizar precios', level: 1 })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Categoría' })).toContainText('Descartables')

  // 0 % is refused with the shared schema's message, before asking the API.
  const percent = page.getByRole('textbox', { name: 'Porcentaje' })
  await percent.fill('0')
  await page.getByRole('button', { name: 'Ver vista previa' }).click()
  await expect(page.getByText('Ingresá un porcentaje distinto de 0')).toBeVisible()

  await percent.fill('12,5')
  await page.getByRole('button', { name: 'Ver vista previa' }).click()
  const preview = page.getByRole('table')
  // The Products with their current and new Price, by name.
  const rows = preview.getByRole('row').filter({ has: page.getByRole('cell') })
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(0)).toContainText('Bandeja 103')
  await expect(rows.nth(0)).toContainText('$ 333,33')
  await expect(rows.nth(0)).toContainText('$ 375,00')
  await expect(rows.nth(1)).toContainText('Vaso térmico 180 cc')
  await expect(rows.nth(1)).toContainText('$ 1.000,00')
  await expect(rows.nth(1)).toContainText('$ 1.125,00')
  await expect(preview).not.toContainText('Lavandina')

  // Cancel writes nothing.
  await page.getByRole('button', { name: 'Cancelar' }).click()
  await expect(page.getByRole('table')).toHaveCount(0)
  await page.goto('/productos')
  await expect(page.getByRole('link', { name: /Vaso térmico 180 cc/ })).toContainText('$ 1.000,00')

  // Applying it this time.
  await page.goto('/productos/categorias')
  await page.getByRole('link', { name: 'Actualizar precios de Descartables' }).click()
  await page.getByRole('textbox', { name: 'Porcentaje' }).fill('12,5')
  await page.getByRole('button', { name: 'Ver vista previa' }).click()
  await expect(page.getByRole('table').getByRole('row').filter({ has: page.getByRole('cell') })).toHaveCount(2)
  await page.getByRole('button', { name: 'Aplicar a 2 productos' }).click()
  await expect(page.getByText('Precios actualizados', { exact: true })).toBeVisible()

  // The catalog, filtered by the Category, shows the new Prices; other Categories keep theirs.
  await expect(page).toHaveURL(/\/productos\?categoria=/)
  await expect(page.getByRole('link', { name: /Vaso térmico 180 cc/ })).toContainText('$ 1.125,00')
  await expect(page.getByRole('link', { name: /Bandeja 103/ })).toContainText('$ 375,00')
  await page.goto('/productos')
  await expect(page.getByRole('link', { name: /Lavandina 1 L/ })).toContainText('$ 950,00')
})
