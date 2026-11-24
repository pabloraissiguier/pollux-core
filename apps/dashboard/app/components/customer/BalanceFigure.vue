<script setup lang="ts">
import type { Money } from '@pollux/contracts'
import { balanceCaption, balanceTone, signedBalanceText } from '~/utils/balance'

/**
 * A Customer's Balance, big: what they owe in red with a minus, or the credit in their favor in
 * green with a plus (and said in words, never by color alone). `label` names it, e.g. "Saldo de Kiosco La Esquina".
 */
const props = withDefaults(defineProps<{ balance: Money, label?: string }>(), { label: 'Saldo' })
</script>

<template>
  <div class="flex flex-col gap-1">
    <span class="text-sm text-muted">{{ label }}</span>
    <span
      role="status"
      :aria-label="label"
      class="text-3xl font-semibold tabular-nums"
      :class="balanceTone(props.balance)"
    >{{ signedBalanceText(props.balance) }}</span>
    <span class="text-sm text-muted">{{ balanceCaption(balance) }}</span>
  </div>
</template>
