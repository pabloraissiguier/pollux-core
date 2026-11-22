<script setup lang="ts">
import type { Payment } from '~/utils/payments'

/**
 * Payments newest first, each with its method, date, reference and amount, and "Anular pago"
 * while it stands. A voided Payment stays in the list, marked "Anulado" with its reason.
 * `showOrder` adds the Order it was collected with. Emits each Payment once voided.
 */
withDefaults(defineProps<{ payments: Payment[], showOrder?: boolean }>(), { showOrder: false })
const emit = defineEmits<{ voided: [payment: Payment] }>()

const voiding = ref<Payment | null>(null)
const voidOpen = ref(false)

function startVoid(payment: Payment) {
  voiding.value = payment
  voidOpen.value = true
}
</script>

<template>
  <ul class="divide-y divide-default">
    <li
      v-for="payment in payments"
      :key="payment.id"
      class="flex items-start justify-between gap-3 py-3"
    >
      <span class="flex min-w-0 flex-col gap-0.5">
        <span class="flex flex-wrap items-center gap-2">
          <span class="font-medium text-highlighted">{{ paymentMethodLabels[payment.method] }}</span>
          <UBadge
            v-if="payment.voidedAt"
            label="Anulado"
            color="error"
            variant="subtle"
            size="sm"
          />
        </span>
        <span class="text-sm text-muted tabular-nums">
          {{ formatDate(payment.paidOn) }}<template v-if="payment.reference"> · {{ payment.reference }}</template>
        </span>
        <ULink
          v-if="showOrder && payment.order"
          :to="`/pedidos/${payment.order.id}`"
          class="text-sm"
        >
          Pedido N° {{ payment.order.number }}
        </ULink>
        <span
          v-if="payment.voidReason"
          class="text-sm text-muted"
        >Motivo: {{ payment.voidReason }}</span>
      </span>
      <span class="flex shrink-0 flex-col items-end gap-1">
        <span
          class="font-medium tabular-nums"
          :class="payment.voidedAt ? 'text-muted line-through' : 'text-highlighted'"
        >{{ formatMoney(payment.amount) }}</span>
        <UButton
          v-if="!payment.voidedAt"
          label="Anular pago"
          color="error"
          variant="link"
          size="sm"
          @click="startVoid(payment)"
        />
      </span>
    </li>
  </ul>

  <PaymentVoidModal
    v-if="voiding"
    v-model:open="voidOpen"
    :payment="voiding"
    @voided="emit('voided', $event)"
  />
</template>
