import type {
  branchSchema,
  branchUpdateSchema,
  customerCreateSchema,
  customerListQuerySchema,
  customerUpdateSchema,
} from '@pollux/contracts'
import { branches, customers } from '@pollux/db/schema'
import { and, asc, count, eq, exists, ilike, inArray, or, sql } from 'drizzle-orm'
import type { z } from 'zod'
import type { Database, DbOrTx } from '../db'
import { ApiError } from '../errors'

// Validated request bodies, after the shared schemas' transforms (e.g. CUIT formatted, '' → null).
type ValidCustomerCreate = z.output<typeof customerCreateSchema>
type ValidCustomerUpdate = z.output<typeof customerUpdateSchema>
type ValidBranchCreate = z.output<typeof branchSchema>
type ValidBranchUpdate = z.output<typeof branchUpdateSchema>
type ValidCustomerListQuery = z.output<typeof customerListQuerySchema>

const customerColumns = {
  id: customers.id,
  name: customers.name,
  legalName: customers.legalName,
  cuit: customers.cuit,
  vatCondition: customers.vatCondition,
  phone: customers.phone,
  notes: customers.notes,
  createdAt: customers.createdAt,
  updatedAt: customers.updatedAt,
}

const branchColumns = {
  id: branches.id,
  customerId: branches.customerId,
  name: branches.name,
  address: branches.address,
  city: branches.city,
  province: branches.province,
  postalCode: branches.postalCode,
  notes: branches.notes,
}

const customerNotFound = () => new ApiError(404, 'customer_not_found', 'No encontramos el cliente')
const branchNotFound = () => new ApiError(404, 'branch_not_found', 'No encontramos la sucursal de este cliente')

/** This business's Customer with this id. */
const isCustomer = (businessId: string, customerId: string) =>
  and(eq(customers.businessId, businessId), eq(customers.id, customerId))

/** Throws `customer_not_found` unless the Customer is in this business. */
export async function assertCustomer(db: DbOrTx, businessId: string, customerId: string) {
  const [found] = await db.select({ id: customers.id }).from(customers).where(isCustomer(businessId, customerId))
  if (!found) throw customerNotFound()
}

/** The given Customer rows, each with its Branches (oldest first). */
async function withBranches<C extends { id: string }>(db: DbOrTx, businessId: string, rows: C[]) {
  if (rows.length === 0) return []
  const branchRows = await db
    .select(branchColumns)
    .from(branches)
    .where(and(eq(branches.businessId, businessId), inArray(branches.customerId, rows.map(r => r.id))))
    .orderBy(asc(branches.createdAt), asc(branches.address), asc(branches.id))
  return rows.map(customer => ({
    ...customer,
    branches: branchRows
      .filter(b => b.customerId === customer.id)
      .map(({ id, name, address, city, province, postalCode, notes }) => ({ id, name, address, city, province, postalCode, notes })),
  }))
}

/** One Customer with its Branches, or 404 when it isn't in this business. */
export async function getCustomer(db: DbOrTx, businessId: string, customerId: string) {
  const rows = await db.select(customerColumns).from(customers).where(isCustomer(businessId, customerId))
  const [customer] = await withBranches(db, businessId, rows)
  if (!customer) throw customerNotFound()
  return customer
}

/** Registers a Customer and its Branches in one transaction. */
export async function createCustomer(db: Database, businessId: string, input: ValidCustomerCreate) {
  return db.transaction(async (tx) => {
    const { branches: newBranches, ...fields } = input
    const [created] = await tx
      .insert(customers)
      .values({ ...fields, businessId })
      .returning({ id: customers.id })
    await tx.insert(branches).values(newBranches.map(b => ({ ...b, businessId, customerId: created!.id })))
    return getCustomer(tx, businessId, created!.id)
  })
}

/** Changes the given details of a Customer; `null` clears an optional one. */
export async function updateCustomer(db: Database, businessId: string, customerId: string, input: ValidCustomerUpdate) {
  const [updated] = await db
    .update(customers)
    .set({ ...input, updatedAt: sql`now()` })
    .where(isCustomer(businessId, customerId))
    .returning({ id: customers.id })
  if (!updated) throw customerNotFound()
  return getCustomer(db, businessId, customerId)
}

/** Adds a Branch to a Customer and returns the Customer with all its Branches. */
export async function addBranch(db: Database, businessId: string, customerId: string, input: ValidBranchCreate) {
  return db.transaction(async (tx) => {
    await assertCustomer(tx, businessId, customerId)
    await tx.insert(branches).values({ ...input, businessId, customerId })
    return getCustomer(tx, businessId, customerId)
  })
}

/** Edits one of a Customer's Branches and returns the Customer with all its Branches. */
export async function updateBranch(
  db: Database,
  businessId: string,
  customerId: string,
  branchId: string,
  input: ValidBranchUpdate,
) {
  return db.transaction(async (tx) => {
    // Checked first, so another business's Customer is `customer_not_found` like everywhere else.
    await assertCustomer(tx, businessId, customerId)
    const [updated] = await tx
      .update(branches)
      .set({ ...input, updatedAt: sql`now()` })
      .where(and(
        eq(branches.businessId, businessId),
        eq(branches.customerId, customerId),
        eq(branches.id, branchId),
      ))
      .returning({ id: branches.id })
    if (!updated) throw branchNotFound()
    return getCustomer(tx, businessId, customerId)
  })
}

/** Escapes `%`, `_` and `\` so user text matches literally inside a LIKE pattern. */
function likeContains(text: string) {
  return `%${text.replace(/[\\%_]/g, c => `\\${c}`)}%`
}

/**
 * Customers by name, with their Branches. `q` matches name, legal name or CUIT (with or without
 * dashes); `town` keeps Customers with a Branch in that town (case-insensitive).
 */
export async function listCustomers(db: Database, businessId: string, query: ValidCustomerListQuery) {
  const { q, town, limit, offset } = query
  // CUITs are stored as XX-XXXXXXXX-X, so both sides are compared without dashes.
  const cuitQuery = q?.replace(/-/g, '')
  const where = and(
    eq(customers.businessId, businessId),
    q
      ? or(
          ilike(customers.name, likeContains(q)),
          ilike(customers.legalName, likeContains(q)),
          cuitQuery ? sql`replace(${customers.cuit}, '-', '') ilike ${likeContains(cuitQuery)}` : undefined,
        )
      : undefined,
    town
      ? exists(db
          .select({ one: sql`1` })
          .from(branches)
          .where(and(
            eq(branches.businessId, businessId),
            eq(branches.customerId, customers.id),
            sql`lower(${branches.city}) = lower(${town})`,
          )))
      : undefined,
  )

  const [rows, [counted]] = await Promise.all([
    db.select(customerColumns).from(customers).where(where).orderBy(asc(customers.name), asc(customers.id)).limit(limit).offset(offset),
    db.select({ total: count() }).from(customers).where(where),
  ])
  return { items: await withBranches(db, businessId, rows), total: counted!.total }
}
