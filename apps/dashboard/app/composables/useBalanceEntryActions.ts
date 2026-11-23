import type { DropdownMenuItem } from '@nuxt/ui'
import type { BalanceEntryKind } from '~/utils/balance'

/**
 * The manual Balance entries a Customer's page offers under "Más acciones": "Saldo inicial"
 * only while the Customer's Balance says they have none (`hasOpeningBalance`, unknown while it
 * loads), and "Ajustar saldo". Holds which `BalanceEntryModal` is open; `onSaved` refreshes what
 * the page shows, the Balance included, which then carries `hasOpeningBalance: true`.
 */
export function useBalanceEntryActions(hasOpeningBalance: MaybeRefOrGetter<boolean | undefined>, onSaved: () => void) {
  const kind = ref<BalanceEntryKind>('adjustment')
  const open = ref(false)

  function start(entryKind: BalanceEntryKind) {
    kind.value = entryKind
    open.value = true
  }

  const items = computed<DropdownMenuItem[]>(() => [
    ...(toValue(hasOpeningBalance) === false
      ? [{ label: 'Saldo inicial', icon: 'i-lucide-file-spreadsheet', onSelect: () => start('opening') }]
      : []),
    { label: 'Ajustar saldo', icon: 'i-lucide-scale', onSelect: () => start('adjustment') }
  ])

  return { items, kind, open, saved: onSaved }
}
