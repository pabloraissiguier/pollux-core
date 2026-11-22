/**
 * The business's Suppliers, by name, for pickers and filters. A distributor buys from a handful,
 * so one page of 200 holds them all. Shared under one key: `refresh()` after creating or editing.
 */
export function useSuppliers() {
  const { request } = useApi()
  return useAsyncData(
    'proveedores-todos',
    async () => (await request(c => c.suppliers.$get({ query: { limit: '200' } }))).items,
    { default: () => [] }
  )
}
