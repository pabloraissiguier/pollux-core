<script setup lang="ts">
import type { Money } from '@pollux/contracts'
import { balanceCaption, debitOrCredit } from '~/utils/balance'

/**
 * A Customer's Balance, big: what they owe, or the credit in their favor (shown without a sign
 * and said in words, never by color alone). `label` names it, e.g. "Saldo de Kiosco La Esquina".
 */
const props = withDefaults(defineProps<{ balance: Money, label?: string }>(), { label: 'Saldo' })

const figure = computed(() => debitOrCredit(props.balance))
</script>

<template>
  <div class="flex flex-col gap-1">
    <span class="text-sm text-muted">{{ label }}</span>
    <span
      role="status"
      :aria-label="label"
      class="text-3xl font-semibold tabular-nums"
      :class="figure.side === 'credit' ? 'text-success' : 'text-highlighted'"
    >{{ formatMoney(figure.amount) }}</span>
    <span class="text-sm text-muted">{{ balanceCaption(balance) }}</span>
  </div>
</template>
