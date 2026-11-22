import type { supplierCreateSchema, supplierListQuerySchema, supplierUpdateSchema } from '@pollux/contracts'
import { suppliers } from '@pollux/db/schema'
import { and, asc, count, eq, ilike, or, sql } from 'drizzle-orm'
import type { z } from 'zod'
import type { DbOrTx } from '../db'
import { ApiError } from '../errors'
import { likeContains } from '../like'

type ValidSupplierCreate = z.output<typeof supplierCreateSchema>
type ValidSupplierUpdate = z.output<typeof supplierUpdateSchema>
type ValidSupplierListQuery = z.output<typeof supplierListQuerySchema>

const supplierColumns = {
  id: suppliers.id,
  name: suppliers.name,
  cuit: suppliers.cuit,
  phone: suppliers.phone,
  notes: suppliers.notes,
  createdAt: suppliers.createdAt,
  updatedAt: suppliers.updatedAt,
}

export const supplierNotFound = () => new ApiError(404, 'supplier_not_found', 'No encontramos el proveedor')

/** This business's Supplier with this id. */
export const isSupplier = (businessId: string, supplierId: string) =>
  and(eq(suppliers.businessId, businessId), eq(suppliers.id, supplierId))

/** One Supplier, or 404 when it isn't in this business. */
export async function getSupplier(db: DbOrTx, businessId: string, supplierId: string) {
  const [supplier] = await db.select(supplierColumns).from(suppliers).where(isSupplier(businessId, supplierId))
  if (!supplier) throw supplierNotFound()
  return supplier
}

export async function createSupplier(db: DbOrTx, businessId: string, input: ValidSupplierCreate) {
  const [created] = await db.insert(suppliers).values({ ...input, businessId }).returning(supplierColumns)
  return created!
}

/** Changes the given details of a Supplier; `null` clears an optional one. */
export async function updateSupplier(db: DbOrTx, businessId: string, supplierId: string, input: ValidSupplierUpdate) {
  const [updated] = await db
    .update(suppliers)
    .set({ ...input, updatedAt: sql`now()` })
    .where(isSupplier(businessId, supplierId))
    .returning(supplierColumns)
  if (!updated) throw supplierNotFound()
  return updated
}

/** Suppliers by name. `q` matches the name or the CUIT (with or without dashes). */
export async function listSuppliers(db: DbOrTx, businessId: string, query: ValidSupplierListQuery) {
  const { q, limit, offset } = query
  // CUITs are stored as XX-XXXXXXXX-X, so both sides are compared without dashes.
  const cuitQuery = q?.replace(/-/g, '')
  const where = and(
    eq(suppliers.businessId, businessId),
    q
      ? or(
          ilike(suppliers.name, likeContains(q)),
          cuitQuery ? sql`replace(${suppliers.cuit}, '-', '') ilike ${likeContains(cuitQuery)}` : undefined,
        )
      : undefined,
  )
  const [items, [counted]] = await Promise.all([
    db.select(supplierColumns).from(suppliers).where(where).orderBy(asc(suppliers.name), asc(suppliers.id)).limit(limit).offset(offset),
    db.select({ total: count() }).from(suppliers).where(where),
  ])
  return { items, total: counted!.total }
}
