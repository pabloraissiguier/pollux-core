/** Pages that work without an active business. */
const BUSINESS_FREE = new Set(['/login', '/negocio'])

/**
 * Signed-out users go to `/login`, which sends them back where they were afterwards. Signed-in
 * users need an active business: the first navigation loads theirs (`GET /me`) and sends them to
 * the picker when they have several and this device hasn't chosen one yet. When this device has
 * already chosen one, the page opens with it at once and `/me` loads alongside, so the page's
 * own data doesn't wait behind `/me`.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const { signedIn } = useAuth()

  if (to.path === '/login') {
    if (signedIn.value) return navigateTo(safeRedirect(to.query.redirect))
    return
  }
  if (!signedIn.value) {
    return navigateTo(withReturnPath('/login', to.fullPath))
  }

  const { businesses, activeBusinessId, loadBusinesses, restoreChoice } = useActiveBusiness()
  if (businesses.value || activeBusinessId.value || BUSINESS_FREE.has(to.path)) return

  const userId = await useAuth().userId()
  if (userId && restoreChoice(userId)) {
    const router = useRouter()
    // The API client already shows errors and redirects on a 401 or 403.
    loadBusinesses({ returnTo: to.fullPath })
      .then(async (chosen) => {
        if (!chosen) await router.replace(withReturnPath('/negocio', router.currentRoute.value.fullPath))
      })
      .catch(() => {})
    return
  }

  try {
    if (!await loadBusinesses({ navigate: false, returnTo: to.fullPath })) {
      return navigateTo(withReturnPath('/negocio', to.fullPath))
    }
  } catch (error) {
    // The API client has already shown the error; a 401 or 403 says where to go next.
    if (error instanceof ApiRequestError) return error.redirectTo ? navigateTo(error.redirectTo) : abortNavigation(error)
    throw error
  }
})
