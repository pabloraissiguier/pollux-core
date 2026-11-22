<script setup lang="ts">
import type { Money } from '@pollux/contracts'
import { debitOrCredit } from '~/utils/balance'

/**
 * A Customer's Balance, big: what they owe, or the credit in their favor (shown without a sign
 * and said in words, never by color alone).
 */
const props = defineProps<{ balance: Money }>()

const figure = computed(() => debitOrCredit(props.balance))
const caption = computed(() => {
  if (props.balance === '0.00') return 'Al día'
  return figure.value.side === 'debit' ? 'Debe' : 'A favor del cliente'
})
</script>

<template>
  <div class="flex flex-col gap-1">
    <span class="text-sm text-muted">Saldo</span>
    <span
      role="status"
      aria-label="Saldo"
      class="text-3xl font-semibold tabular-nums"
      :class="figure.side === 'credit' ? 'text-success' : 'text-highlighted'"
    >{{ formatMoney(figure.amount) }}</span>
    <span class="text-sm text-muted">{{ caption }}</span>
  </div>
</template>
