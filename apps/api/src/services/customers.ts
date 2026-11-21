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
import type { Database } from '../db'
import { ApiError } from '../errors'

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]
type Db = Database | Tx

type CustomerCreate = z.output<typeof customerCreateSchema>
type CustomerUpdate = z.output<typeof customerUpdateSchema>
type BranchCreate = z.output<typeof branchSchema>
type BranchUpdate = z.output<typeof branchUpdateSchema>
type CustomerListQuery = z.output<typeof customerListQuerySchema>

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

export const customerNotFound = () => new ApiError(404, 'customer_not_found', 'No encontramos el cliente')

/** The Branches of the given Customers, grouped by Customer, oldest first. */
async function branchesOf(db: Db, businessId: string, customerIds: string[]) {
  const byCustomer = new Map<string, Omit<typeof rows[number], 'customerId'>[]>()
  if (customerIds.length === 0) return byCustomer
  const rows = await db
    .select(branchColumns)
    .from(branches)
    .where(and(eq(branches.businessId, businessId), inArray(branches.customerId, customerIds)))
    .orderBy(asc(branches.createdAt), asc(branches.address), asc(branches.id))
  for (const { customerId, ...branch } of rows) {
    const list = byCustomer.get(customerId) ?? []
    list.push(branch)
    byCustomer.set(customerId, list)
  }
  return byCustomer
}

/** One Customer with its Branches, or 404 when it isn't in this business. */
export async function getCustomer(db: Db, businessId: string, customerId: string) {
  const [customer] = await db
    .select(customerColumns)
    .from(customers)
    .where(and(eq(customers.businessId, businessId), eq(customers.id, customerId)))
  if (!customer) throw customerNotFound()
  const byCustomer = await branchesOf(db, businessId, [customer.id])
  return { ...customer, branches: byCustomer.get(customer.id) ?? [] }
}

export type CustomerDetail = Awaited<ReturnType<typeof getCustomer>>

/** Registers a Customer and its Branches in one transaction. */
export async function createCustomer(db: Database, businessId: string, input: CustomerCreate) {
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
export async function updateCustomer(db: Database, businessId: string, customerId: string, input: CustomerUpdate) {
  const [updated] = await db
    .update(customers)
    .set({ ...input, updatedAt: sql`now()` })
    .where(and(eq(customers.businessId, businessId), eq(customers.id, customerId)))
    .returning({ id: customers.id })
  if (!updated) throw customerNotFound()
  return getCustomer(db, businessId, customerId)
}

/** Adds a Branch to a Customer and returns the Customer with all its Branches. */
export async function addBranch(db: Database, businessId: string, customerId: string, input: BranchCreate) {
  return db.transaction(async (tx) => {
    const [customer] = await tx
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.businessId, businessId), eq(customers.id, customerId)))
    if (!customer) throw customerNotFound()
    await tx.insert(branches).values({ ...input, businessId, customerId })
    return getCustomer(tx, businessId, customerId)
  })
}

/** Edits one of a Customer's Branches and returns the Customer with all its Branches. */
export async function updateBranch(db: Database, businessId: string, customerId: string, branchId: string, input: BranchUpdate) {
  return db.transaction(async (tx) => {
    // The Customer is checked first so another business's Customer is a `customer_not_found`.
    await getCustomer(tx, businessId, customerId)
    const [updated] = await tx
      .update(branches)
      .set({ ...input, updatedAt: sql`now()` })
      .where(and(
        eq(branches.businessId, businessId),
        eq(branches.customerId, customerId),
        eq(branches.id, branchId),
      ))
      .returning({ id: branches.id })
    if (!updated) throw new ApiError(404, 'branch_not_found', 'No encontramos la sucursal de este cliente')
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
export async function listCustomers(db: Database, businessId: string, query: CustomerListQuery) {
  const { q, town, limit, offset } = query
  const cuitDigits = q?.replace(/[-\s]/g, '')
  const where = and(
    eq(customers.businessId, businessId),
    q
      ? or(
          ilike(customers.name, likeContains(q)),
          ilike(customers.legalName, likeContains(q)),
          cuitDigits ? sql`replace(${customers.cuit}, '-', '') ilike ${likeContains(cuitDigits)}` : undefined,
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
  const byCustomer = await branchesOf(db, businessId, rows.map(r => r.id))
  return {
    items: rows.map(r => ({ ...r, branches: byCustomer.get(r.id) ?? [] })),
    total: counted!.total,
  }
}
