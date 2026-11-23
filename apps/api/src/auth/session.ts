import { businesses, businessMembers, profiles } from '@pollux/db/schema'
import { asc, eq } from 'drizzle-orm'
import { createMiddleware } from 'hono/factory'
import { z } from 'zod'
import type { AppEnv } from '../context'
import { ApiError, fieldErrors, notAMember, unauthorized, validationError } from '../errors'
import type { AuthVerifier } from './verifier'

const BUSINESS_HEADER = 'x-business-id'
const businessHeader = z.uuid({ message: 'Debe ser el id de un negocio' }).optional()

/**
 * Authentication and tenancy, for every request:
 * 1. Verifies the bearer token (401 when missing or invalid).
 * 2. Creates the `profiles` row the first time a valid user shows up.
 * 3. Resolves the active business from `X-Business-Id` (403 unless the user is a member), or
 *    picks it automatically when the user belongs to exactly one.
 */
export function session(verifyToken: AuthVerifier) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const token = c.req.header('Authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1]
    const userId = token ? await verifyToken(token) : null
    if (!userId) throw unauthorized()

    // Sent together, so they cost one round trip to the DB rather than two: postgres-js pipelines
    // them on one connection. The memberships don't depend on the new `profiles` row, since a
    // user who has just been created has none yet.
    const db = c.var.db
    const [, memberships] = await Promise.all([
      db.insert(profiles).values({ id: userId }).onConflictDoNothing(),
      db
        .select({ id: businesses.id, name: businesses.name, role: businessMembers.role })
        .from(businessMembers)
        .innerJoin(businesses, eq(businesses.id, businessMembers.businessId))
        .where(eq(businessMembers.profileId, userId))
        .orderBy(asc(businesses.name), asc(businesses.id)),
    ])

    const header = businessHeader.safeParse(c.req.header(BUSINESS_HEADER))
    if (!header.success) throw validationError(fieldErrors(header.error, BUSINESS_HEADER))

    let businessId: string | null = null
    if (header.data) {
      if (!memberships.some(m => m.id === header.data)) throw notAMember()
      businessId = header.data
    }
    else if (memberships.length === 1) {
      businessId = memberships[0]!.id
    }

    c.set('profileId', userId)
    c.set('memberships', memberships)
    c.set('businessId', businessId)
    await next()
  })
}

/**
 * For business-scoped routers: requires an active business and narrows `businessId` to a string.
 * 403 when the user belongs to no business; 400 when they belong to several and sent no header.
 */
export const requireBusiness = createMiddleware<AppEnv & { Variables: { businessId: string } }>(async (c, next) => {
  if (!c.var.businessId) {
    if (c.var.memberships.length === 0) throw new ApiError(403, 'no_business', 'Tu usuario no pertenece a ningún negocio')
    throw new ApiError(400, 'business_not_selected', 'Elegí un negocio para continuar')
  }
  await next()
})
