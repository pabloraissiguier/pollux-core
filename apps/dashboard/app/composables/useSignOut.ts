/**
 * Ending the session on this device: the auth session, the user's businesses in memory and every
 * cached page's data. The device keeps the user's chosen business for their next sign-in.
 */
export function useSignOut() {
  const auth = useAuth()
  const { forgetSession } = useActiveBusiness()
  const router = useRouter()

  /** Ends the session without navigating (the API client picks where to go). */
  async function endSession() {
    await auth.signOut()
    forgetSession()
    clearNuxtData()
  }

  /** The "Cerrar sesión" action. */
  async function signOut() {
    await endSession()
    await router.replace('/login')
  }

  return { endSession, signOut }
}
