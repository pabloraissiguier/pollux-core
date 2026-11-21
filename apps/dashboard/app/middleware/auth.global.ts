/** Pages that work without an active business. */
const BUSINESS_FREE = new Set(['/login', '/negocio'])

/**
 * Signed-out users go to `/login`, which sends them back where they were afterwards. Signed-in
 * users need an active business: the first navigation loads theirs (`GET /me`) and sends them to
 * the picker when they have several and this device hasn't chosen one yet.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const { signedIn } = useAuth()

  if (to.path === '/login') {
    if (signedIn.value) return navigateTo(safeRedirect(to.query.redirect))
    return
  }
  if (!signedIn.value) {
    return navigateTo({ path: '/login', query: to.fullPath === '/' ? {} : { redirect: to.fullPath } })
  }

  const { businesses, loadBusinesses } = useActiveBusiness()
  if (businesses.value || BUSINESS_FREE.has(to.path)) return
  try {
    if (!await loadBusinesses({ navigate: false })) {
      return navigateTo({ path: '/negocio', query: to.fullPath === '/' ? {} : { redirect: to.fullPath } })
    }
  } catch (error) {
    // The API client has already shown the error; a 401 or 403 says where to go next.
    if (error instanceof ApiRequestError) return error.redirectTo ? navigateTo(error.redirectTo) : abortNavigation(error)
    throw error
  }
})
