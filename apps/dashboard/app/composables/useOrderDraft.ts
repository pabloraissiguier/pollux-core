import type { CustomerOption } from '~/utils/customers'
import type { OrderFormState } from '~/utils/orders'

/** Where the new-Order form is: the phone steps' names (`OrderForm`). */
export type OrderFormStep = 'cliente' | 'productos' | 'confirmar'

/** A new Order being taken, as kept on this device until it's saved or discarded. */
export interface OrderDraft {
  state: OrderFormState
  customer: CustomerOption | null
  step: OrderFormStep
}

const VERSION = 1

/** Whether a draft holds anything worth keeping. A fresh form's Delivery date doesn't count. */
function hasContent(draft: OrderDraft): boolean {
  const { state, customer } = draft
  return !!customer || state.lines.length > 0 || state.notes.trim() !== '' || state.discountPercent.trim() !== ''
}

/**
 * The new Order being taken, kept in `localStorage` per user and business, so leaving the page by
 * mistake (or a reload, or the phone dropping the tab) loses nothing. `OrderForm` reads it once
 * when it opens, writes it on every change and clears it once the Order is saved or discarded.
 * Without a signed-in user and business, or with storage blocked, it keeps nothing.
 */
export function useOrderDraft() {
  const { userId, activeBusinessId } = useActiveBusiness()
  const key = computed(() => (userId.value && activeBusinessId.value ? `pollux.order-draft.${userId.value}.${activeBusinessId.value}` : null))

  /** The kept draft, or null when there is none (or it can't be read). A past Delivery date moves to tomorrow. */
  function read(): OrderDraft | null {
    if (!key.value) return null
    try {
      const stored = JSON.parse(readStorage(key.value) ?? 'null')
      if (stored?.version !== VERSION || !Array.isArray(stored.draft?.state?.lines)) return null
      const draft = stored.draft as OrderDraft
      if (draft.state.deliveryDate < todayInArgentina()) draft.state.deliveryDate = tomorrowInArgentina()
      return hasContent(draft) ? draft : null
    } catch {
      return null
    }
  }

  function write(draft: OrderDraft) {
    if (!key.value) return
    writeStorage(key.value, hasContent(draft) ? JSON.stringify({ version: VERSION, draft }) : null)
  }

  function clear() {
    if (key.value) writeStorage(key.value, null)
  }

  return { read, write, clear, hasContent }
}
