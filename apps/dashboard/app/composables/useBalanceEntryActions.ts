import type { DropdownMenuItem } from '@nuxt/ui'
import type { BalanceEntryKind } from '~/utils/balance'

/**
 * The manual Balance entries a Customer's page offers under "Más acciones": "Saldo inicial"
 * only while the Customer has none, and "Ajustar saldo". Holds which `BalanceEntryModal` is
 * open; `onSaved` refreshes what the page shows, and this refreshes whether an Opening balance
 * exists when one was just entered.
 */
export async function useBalanceEntryActions(customerId: string, onSaved: () => void) {
  const { data: hasOpeningBalance, refresh: refreshOpeningBalance } = await useHasOpeningBalance(customerId)

  const kind = ref<BalanceEntryKind>('adjustment')
  const open = ref(false)

  function start(entryKind: BalanceEntryKind) {
    kind.value = entryKind
    open.value = true
  }

  const items = computed<DropdownMenuItem[]>(() => [
    ...(hasOpeningBalance.value === false
      ? [{ label: 'Saldo inicial', icon: 'i-lucide-file-spreadsheet', onSelect: () => start('opening') }]
      : []),
    { label: 'Ajustar saldo', icon: 'i-lucide-scale', onSelect: () => start('adjustment') }
  ])

  function saved() {
    onSaved()
    if (kind.value === 'opening') refreshOpeningBalance()
  }

  return { items, kind, open, saved }
}
