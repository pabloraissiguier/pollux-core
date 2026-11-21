import type { Locator, Page } from '@playwright/test'
import { expect } from './fixtures'

/** Creates a Category through the Categories screen. */
export async function createCategory(page: Page, name: string) {
  await page.goto('/productos/categorias')
  await page.getByRole('button', { name: 'Nueva categoría' }).click()
  const dialog = page.getByRole('dialog', { name: 'Nueva categoría' })
  await dialog.getByRole('textbox', { name: 'Nombre' }).fill(name)
  await dialog.getByRole('button', { name: 'Crear categoría' }).click()
  await expect(page.getByRole('link', { name, exact: true })).toBeVisible()
}

/** Creates a Product through the new-Product screen, and ends on its page. */
export async function createProduct(page: Page, product: { code: string, name: string, category?: string, price: string }) {
  await page.goto('/productos/nuevo')
  await page.getByRole('textbox', { name: 'Código' }).fill(product.code)
  await page.getByRole('textbox', { name: 'Nombre' }).fill(product.name)
  if (product.category) {
    await page.getByRole('button', { name: 'Categoría' }).click()
    await page.getByRole('option', { name: product.category }).click()
  }
  await page.getByRole('textbox', { name: 'Precio' }).fill(product.price)
  await page.getByRole('button', { name: 'Crear producto' }).click()
  await expect(page.getByRole('heading', { name: product.name, level: 1 })).toBeVisible()
}

/** A `UTable`'s data rows: its header also holds an empty decoration row. */
export function dataRows(table: Locator) {
  return table.getByRole('row').filter({ has: table.page().getByRole('cell') })
}
