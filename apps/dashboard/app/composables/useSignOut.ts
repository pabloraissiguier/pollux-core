/**
 * Ends the session on this device and forgets the signed-in user's data. The chosen business
 * stays remembered for the next sign-in on this device.
 */
export function useSignOut() {
  const auth = useAuth()
  const { reset } = useActiveBusiness()
  const router = useRouter()

  async function signOut() {
    await auth.signOut()
    reset()
    clearNuxtData()
    await router.replace('/login')
  }

  return { signOut }
}
