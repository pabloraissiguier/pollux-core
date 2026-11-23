/**
 * Counts a navigation as activity from the moment it starts (route middleware, the page's code
 * chunk) until the new page has rendered, so `AppActivityBar` shows while a tap is being answered.
 */
export default defineNuxtPlugin((nuxtApp) => {
  const { navigating } = useActivity()
  const router = useRouter()

  let routing = false
  let suspended = false
  const update = () => {
    navigating.value = routing || suspended
  }

  router.beforeEach(() => {
    routing = true
    update()
  })
  router.afterEach(() => {
    routing = false
    update()
  })
  router.onError(() => {
    routing = false
    update()
  })
  nuxtApp.hook('page:loading:start', () => {
    suspended = true
    update()
  })
  nuxtApp.hook('page:loading:end', () => {
    suspended = false
    update()
  })
})
