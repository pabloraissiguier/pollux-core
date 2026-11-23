/**
 * The business's Categories, by name, shared by every screen under one key: after creating or
 * renaming one, `refresh()` (or `refreshNuxtData('categorias')`) updates them all.
 * A distributor has a few dozen at most, so one page of 200 holds them all.
 */
export function useCategories() {
  const { request } = useApi()
  return useLazyAsyncData(
    'categorias',
    async () => (await request(c => c.categories.$get({ query: { limit: '200' } }))).items,
    { default: () => [] }
  )
}
