import type { categoryListQuerySchema, categorySchema } from '@pollux/contracts'
import { categories } from '@pollux/db/schema'
import { and, asc, count, eq, sql } from 'drizzle-orm'
import type { z } from 'zod'
import type { Database, DbOrTx } from '../db'
import { ApiError } from '../errors'
import { isUniqueViolation } from '../pg-errors'

type ValidCategory = z.output<typeof categorySchema>
type ValidCategoryListQuery = z.output<typeof categoryListQuerySchema>

const categoryColumns = {
  id: categories.id,
  name: categories.name,
  createdAt: categories.createdAt,
  updatedAt: categories.updatedAt,
}

const categoryNotFound = () => new ApiError(404, 'category_not_found', 'No encontramos la categoría')

/** Turns the per-business unique name violation into a 409; rethrows anything else. */
function nameTaken(err: unknown): never {
  if (isUniqueViolation(err, 'categories_business_id_name_key')) {
    throw new ApiError(409, 'category_name_taken', 'Ya existe una categoría con ese nombre')
  }
  throw err
}

const isCategory = (businessId: string, categoryId: string) =>
  and(eq(categories.businessId, businessId), eq(categories.id, categoryId))

/** The Category's id and name; throws `category_not_found` unless it is in this business. */
export async function getCategory(db: DbOrTx, businessId: string, categoryId: string) {
  const [found] = await db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(isCategory(businessId, categoryId))
  if (!found) throw categoryNotFound()
  return found
}

/** Throws `category_not_found` unless the Category is in this business. */
export async function assertCategory(db: DbOrTx, businessId: string, categoryId: string) {
  await getCategory(db, businessId, categoryId)
}

export async function createCategory(db: Database, businessId: string, input: ValidCategory) {
  const [created] = await db
    .insert(categories)
    .values({ businessId, name: input.name })
    .returning(categoryColumns)
    .catch(nameTaken)
  return created!
}

export async function renameCategory(db: Database, businessId: string, categoryId: string, input: ValidCategory) {
  const [updated] = await db
    .update(categories)
    .set({ name: input.name, updatedAt: sql`now()` })
    .where(isCategory(businessId, categoryId))
    .returning(categoryColumns)
    .catch(nameTaken)
  if (!updated) throw categoryNotFound()
  return updated
}

/** This business's Categories by name. */
export async function listCategories(db: Database, businessId: string, { limit, offset }: ValidCategoryListQuery) {
  const where = eq(categories.businessId, businessId)
  const [items, [counted]] = await Promise.all([
    db.select(categoryColumns).from(categories).where(where).orderBy(asc(categories.name), asc(categories.id)).limit(limit).offset(offset),
    db.select({ total: count() }).from(categories).where(where),
  ])
  return { items, total: counted!.total }
}
