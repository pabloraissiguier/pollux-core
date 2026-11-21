import type {
  priceHistoryQuerySchema,
  productCreateSchema,
  productListQuerySchema,
  productUpdateSchema,
} from '@pollux/contracts'
import { categories, productPriceChanges, products, profiles } from '@pollux/db/schema'
import { and, asc, count, desc, eq, ilike, or, sql } from 'drizzle-orm'
import type { z } from 'zod'
import type { Database, DbOrTx, Transaction } from '../db'
import { ApiError } from '../errors'
import { isUniqueViolation } from '../pg-errors'
import { assertCategory } from './categories'

type ValidProductCreate = z.output<typeof productCreateSchema>
type ValidProductUpdate = z.output<typeof productUpdateSchema>
type ValidProductListQuery = z.output<typeof productListQuerySchema>
type ValidPriceHistoryQuery = z.output<typeof priceHistoryQuerySchema>

const productColumns = {
  id: products.id,
  code: products.code,
  name: products.name,
  brand: products.brand,
  categoryId: products.categoryId,
  categoryName: categories.name,
  price: products.price,
  vatRate: products.vatRate,
  isActive: products.isActive,
  createdAt: products.createdAt,
  updatedAt: products.updatedAt,
}

type ProductRow = Awaited<ReturnType<typeof selectProducts>>[number]

/** The Product as the API shows it: its Category nested as `{ id, name }` or null. */
function toProduct(row: ProductRow) {
  const { id, code, name, brand, categoryId, categoryName, price, vatRate, isActive, createdAt, updatedAt } = row
  return {
    id,
    code,
    name,
    brand,
    category: categoryId ? { id: categoryId, name: categoryName! } : null,
    price,
    vatRate,
    isActive,
    createdAt,
    updatedAt,
  }
}

const productNotFound = () => new ApiError(404, 'product_not_found', 'No encontramos el producto')

/** Turns the per-business unique Code violation into a 409; rethrows anything else. */
function codeTaken(err: unknown): never {
  if (isUniqueViolation(err, 'products_business_id_code_key')) {
    throw new ApiError(409, 'product_code_taken', 'Ya existe un producto con ese código')
  }
  throw err
}

const isProduct = (businessId: string, productId: string) =>
  and(eq(products.businessId, businessId), eq(products.id, productId))

/** Products joined to their Category, in this business. */
function selectProducts(db: DbOrTx, businessId: string) {
  return db
    .select(productColumns)
    .from(products)
    .leftJoin(categories, and(eq(categories.businessId, businessId), eq(categories.id, products.categoryId)))
}

/** One Product, or 404 when it isn't in this business. */
export async function getProduct(db: DbOrTx, businessId: string, productId: string) {
  const [row] = await selectProducts(db, businessId).where(isProduct(businessId, productId))
  if (!row) throw productNotFound()
  return toProduct(row)
}

/**
 * Keeps a Price change in the Product's price history. `oldPrice` is null for the Price a
 * Product was created with. Call it in the transaction that writes the new Price.
 */
export async function recordPriceChange(
  tx: Transaction,
  change: { businessId: string, productId: string, oldPrice: string | null, newPrice: string, changedBy: string },
) {
  await tx.insert(productPriceChanges).values(change)
}

/** Registers an Active Product and the first row of its price history, in one transaction. */
export async function createProduct(db: Database, businessId: string, profileId: string, input: ValidProductCreate) {
  return db.transaction(async (tx) => {
    if (input.categoryId) await assertCategory(tx, businessId, input.categoryId)
    const [created] = await tx
      .insert(products)
      .values({ ...input, businessId })
      .returning({ id: products.id })
      .catch(codeTaken)
    await recordPriceChange(tx, {
      businessId,
      productId: created!.id,
      oldPrice: null,
      newPrice: input.price,
      changedBy: profileId,
    })
    return getProduct(tx, businessId, created!.id)
  })
}

/**
 * Changes the given fields of a Product; `null` clears Brand or Category. A different Price is a
 * Price change: the Product row is locked, and the change is kept in its price history in the
 * same transaction. `isActive` makes it Inactive or reactivates it; nothing is ever deleted.
 */
export async function updateProduct(
  db: Database,
  businessId: string,
  profileId: string,
  productId: string,
  input: ValidProductUpdate,
) {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ price: products.price })
      .from(products)
      .where(isProduct(businessId, productId))
      .for('update')
    if (!current) throw productNotFound()
    if (input.categoryId) await assertCategory(tx, businessId, input.categoryId)

    await tx
      .update(products)
      .set({ ...input, updatedAt: sql`now()` })
      .where(isProduct(businessId, productId))
      .catch(codeTaken)

    if (input.price !== undefined && input.price !== current.price) {
      await recordPriceChange(tx, { businessId, productId, oldPrice: current.price, newPrice: input.price, changedBy: profileId })
    }
    return getProduct(tx, businessId, productId)
  })
}

/** Escapes `%`, `_` and `\` so user text matches literally inside a LIKE pattern. */
function likeContains(text: string) {
  return `%${text.replace(/[\\%_]/g, c => `\\${c}`)}%`
}

/**
 * Products by name. `q` matches name, Code or Brand (case-insensitive); `categoryId` and
 * `active` filter by Category and by Active status.
 */
export async function listProducts(db: Database, businessId: string, query: ValidProductListQuery) {
  const { q, categoryId, active, limit, offset } = query
  const where = and(
    eq(products.businessId, businessId),
    q
      ? or(
          ilike(products.name, likeContains(q)),
          ilike(products.code, likeContains(q)),
          ilike(products.brand, likeContains(q)),
        )
      : undefined,
    categoryId ? eq(products.categoryId, categoryId) : undefined,
    active === undefined ? undefined : eq(products.isActive, active),
  )

  const [rows, [counted]] = await Promise.all([
    selectProducts(db, businessId).where(where).orderBy(asc(products.name), asc(products.id)).limit(limit).offset(offset),
    db.select({ total: count() }).from(products).where(where),
  ])
  return { items: rows.map(toProduct), total: counted!.total }
}

/** A Product's Price changes, newest first, with who made each one. */
export async function getPriceHistory(db: Database, businessId: string, productId: string, query: ValidPriceHistoryQuery) {
  const [product] = await db.select({ id: products.id }).from(products).where(isProduct(businessId, productId))
  if (!product) throw productNotFound()

  const where = and(eq(productPriceChanges.businessId, businessId), eq(productPriceChanges.productId, productId))
  const [rows, [counted]] = await Promise.all([
    db
      .select({
        id: productPriceChanges.id,
        oldPrice: productPriceChanges.oldPrice,
        newPrice: productPriceChanges.newPrice,
        changedAt: productPriceChanges.changedAt,
        changedById: profiles.id,
        changedByName: profiles.fullName,
      })
      .from(productPriceChanges)
      .leftJoin(profiles, eq(profiles.id, productPriceChanges.changedBy))
      .where(where)
      .orderBy(desc(productPriceChanges.changedAt), desc(productPriceChanges.id))
      .limit(query.limit)
      .offset(query.offset),
    db.select({ total: count() }).from(productPriceChanges).where(where),
  ])
  return {
    items: rows.map(({ changedById, changedByName, ...change }) => ({
      ...change,
      changedBy: changedById ? { id: changedById, fullName: changedByName } : null,
    })),
    total: counted!.total,
  }
}
