/** Entries read per request while looking for the Opening balance (the API's page maximum). */
const SCAN_PAGE_SIZE = 200

/**
 * Whether the Customer already has an Opening balance, so "Saldo inicial" is offered only while
 * they have none. The API has no field for it yet (#64), so this reads the Statement, oldest
 * first, until it finds one: usually on the first page, since it is carried over from before.
 * Shared under `cliente-<id>-saldo-inicial`.
 */
export function useHasOpeningBalance(customerId: string) {
  const { request } = useApi()
  return useAsyncData(`cliente-${customerId}-saldo-inicial`, async () => {
    for (let offset = 0; ; offset += SCAN_PAGE_SIZE) {
      const page = await request(c => c.customers[':id'].statement.$get({
        param: { id: customerId },
        query: { limit: String(SCAN_PAGE_SIZE), offset: String(offset) }
      }))
      if (page.items.some(entry => entry.type === 'opening_balance')) return true
      if (offset + SCAN_PAGE_SIZE >= page.total) return false
    }
  })
}
