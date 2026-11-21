/** This device's chosen business. Each phone or PC remembers its own. */
const STORAGE_KEY = 'pollux.business-id'

export interface Business {
  id: string
  name: string
}

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function writeStored(id: string | null) {
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id)
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage blocked: the choice lasts until the tab closes.
  }
}

/**
 * The businesses the signed-in user belongs to (from `GET /me`) and the active one, which goes
 * out as `X-Business-Id` on every API request.
 */
export function useActiveBusiness() {
  const businesses = useState<Business[] | null>('businesses', () => null)
  const activeBusinessId = useState<string | null>('active-business-id', () => readStored())

  const activeBusiness = computed(() => businesses.value?.find(b => b.id === activeBusinessId.value) ?? null)
  /** The switcher only shows up for users with several businesses. */
  const hasSeveral = computed(() => (businesses.value?.length ?? 0) > 1)

  function selectBusiness(id: string) {
    activeBusinessId.value = id
    writeStored(id)
  }

  function forgetBusiness() {
    activeBusinessId.value = null
    writeStored(null)
  }

  /**
   * Loads the user's businesses. Returns false when the user still has to pick one (several and
   * none chosen on this device, or none at all), so the caller can send them to the picker.
   */
  async function loadBusinesses(options?: ApiRequestOptions): Promise<boolean> {
    const { request } = useApi()
    const me = await request(c => c.me.$get(), options)
    businesses.value = me.businesses.map(({ id, name }) => ({ id, name }))
    if (me.activeBusinessId) selectBusiness(me.activeBusinessId)
    else forgetBusiness()
    return me.activeBusinessId !== null
  }

  /** Forgets everything about the signed-in user, for sign-out. */
  function reset() {
    businesses.value = null
  }

  return { businesses, activeBusinessId, activeBusiness, hasSeveral, selectBusiness, forgetBusiness, loadBusinesses, reset }
}
