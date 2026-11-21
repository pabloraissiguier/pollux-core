import type { Database } from './db'

export interface Membership {
  id: string
  name: string
  role: 'owner'
}

/** What every request carries once it's past the session middleware. */
export interface AppEnv {
  Variables: {
    db: Database
    /** The signed-in user's `profiles.id` (same as `auth.users.id`). */
    profileId: string
    /** Every business the user belongs to, by name. */
    memberships: Membership[]
    /**
     * The active business: from `X-Business-Id`, or the only membership. Null when the user has
     * none or several and sent no header. Business-scoped routes use `requireBusiness`.
     */
    businessId: string | null
  }
}
