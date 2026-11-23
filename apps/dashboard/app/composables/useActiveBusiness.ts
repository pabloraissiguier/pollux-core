export interface Business {
  id: string
  name: string
}

/** Each device remembers each user's choice, so another user signing in on it starts clean. */
const storageKey = (userId: string) => `pollux.business-id.${userId}`

/**
 * The businesses the signed-in user belongs to (from `GET /me`) and the active one, which goes
 * out as `X-Business-Id` on every API request.
 */
export function useActiveBusiness() {
  const userId = useState<string | null>('user-id', () => null)
  const businesses = useState<Business[] | null>('businesses', () => null)
  const activeBusinessId = useState<string | null>('active-business-id', () => null)

  const activeBusiness = computed(() => businesses.value?.find(b => b.id === activeBusinessId.value) ?? null)
  /** The switcher only shows up for users with several businesses. */
  const hasSeveral = computed(() => (businesses.value?.length ?? 0) > 1)

  function setActive(id: string | null) {
    activeBusinessId.value = id
    if (userId.value) writeStorage(storageKey(userId.value), id)
  }

  const selectBusiness = (id: string) => setActive(id)
  const forgetBusiness = () => setActive(null)

  /** After the owner renames the active business (Datos del negocio), without loading `/me` again. */
  function renameActiveBusiness(name: string) {
    const active = businesses.value?.find(b => b.id === activeBusinessId.value)
    if (active) active.name = name
  }

  /**
   * Loads the user's businesses and restores this device's choice. Returns false when the user
   * still has to pick one (several and none chosen here, or none at all), so the caller can send
   * them to the picker. `/me` goes without `X-Business-Id`, so a stale choice (membership
   * removed) just means picking again, not an error.
   */
  async function loadBusinesses(options: ApiRequestOptions = {}): Promise<boolean> {
    const { request } = useApi()
    const me = await request(c => c.me.$get(), { ...options, business: false })
    userId.value = me.profile.id
    businesses.value = me.businesses.map(({ id, name }) => ({ id, name }))

    const stored = readStorage(storageKey(me.profile.id))
    const only = me.businesses.length === 1 ? me.businesses[0]!.id : null
    setActive(me.businesses.some(b => b.id === stored) ? stored : only)
    return activeBusinessId.value !== null
  }

  /** Forgets the signed-in user's businesses in memory (the device keeps their choice). */
  function forgetSession() {
    userId.value = null
    businesses.value = null
    activeBusinessId.value = null
  }

  return { businesses, activeBusinessId, activeBusiness, hasSeveral, selectBusiness, forgetBusiness, renameActiveBusiness, loadBusinesses, forgetSession }
}
