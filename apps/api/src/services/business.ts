import type { businessUpdateSchema } from '@pollux/contracts'
import { businesses } from '@pollux/db/schema'
import { eq, sql } from 'drizzle-orm'
import type { z } from 'zod'
import type { DbOrTx } from '../db'

type ValidBusinessUpdate = z.output<typeof businessUpdateSchema>

const businessColumns = {
  id: businesses.id,
  name: businesses.name,
  legalName: businesses.legalName,
  cuit: businesses.cuit,
  vatCondition: businesses.vatCondition,
  address: businesses.address,
  city: businesses.city,
  province: businesses.province,
  postalCode: businesses.postalCode,
  phone: businesses.phone,
  grossIncomeNumber: businesses.grossIncomeNumber,
  activityStartDate: businesses.activityStartDate,
  createdAt: businesses.createdAt,
  updatedAt: businesses.updatedAt,
}

/** The selected business's own data (Datos del negocio). It exists: the session checked membership. */
export async function getBusiness(db: DbOrTx, businessId: string) {
  const [business] = await db.select(businessColumns).from(businesses).where(eq(businesses.id, businessId))
  return business!
}

/** Changes the given fields of the business's own data; `null` clears an optional one. */
export async function updateBusiness(db: DbOrTx, businessId: string, input: ValidBusinessUpdate) {
  const [updated] = await db
    .update(businesses)
    .set({ ...input, updatedAt: sql`now()` })
    .where(eq(businesses.id, businessId))
    .returning(businessColumns)
  return updated!
}
