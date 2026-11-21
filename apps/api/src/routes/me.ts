import { profiles } from '@pollux/db/schema'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import type { AppEnv } from '../context'

/**
 * The signed-in user, every business they belong to, and the active one. It never requires a
 * business, because it's how the dashboard finds out which ones it can choose from.
 */
export const meRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    const [profile] = await c.var.db
      .select({ id: profiles.id, fullName: profiles.fullName })
      .from(profiles)
      .where(eq(profiles.id, c.var.profileId))

    return c.json({
      profile: profile!,
      businesses: c.var.memberships,
      activeBusinessId: c.var.businessId,
    }, 200)
  })
