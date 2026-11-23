/**
 * Whether the app is waiting on something: a page being entered or an API request in flight.
 * `AppActivityBar` shows it at the top of every screen, so a slow answer never looks like a
 * tap that did nothing. `useApi()` tracks every request; `plugins/activity.ts` tracks navigation.
 */
export function useActivity() {
  const requests = useState('activity-requests', () => 0)
  const navigating = useState('activity-navigating', () => false)

  /** Counts `work` as activity until it settles, and returns its result. */
  async function track<T>(work: () => Promise<T>): Promise<T> {
    requests.value++
    try {
      return await work()
    } finally {
      requests.value--
    }
  }

  return {
    busy: computed(() => navigating.value || requests.value > 0),
    navigating,
    track
  }
}
