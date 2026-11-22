<script setup lang="ts">
import type { z } from 'zod'
import { paymentVoidSchema } from '@pollux/contracts'
import type { Payment } from '~/utils/payments'

/**
 * Anular pago: asks for the reason and confirms in one step. The Payment stays on record, marked
 * void, and its amount goes back on the Customer's Balance. Emits the voided Payment.
 */
const props = defineProps<{ payment: Payment }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ voided: [payment: Payment] }>()

const form = useTemplateRef('form')
const state = reactive({ reason: '' })

watch(open, (isOpen) => {
  if (isOpen) state.reason = ''
})

const { saving: voiding, onSubmit } = useFormSubmit<z.output<typeof paymentVoidSchema>>(form, async (data, request) => {
  emit('voided', await request(c => c.payments[':id'].void.$post({ param: { id: props.payment.id }, json: data })))
  open.value = false
})
</script>

<template>
  <UModal
    v-model:open="open"
    :title="`¿Anular el pago de ${formatMoney(payment.amount)}?`"
    description="El pago queda en el historial marcado como anulado, y su importe vuelve al saldo del cliente."
  >
    <template #body>
      <UForm
        ref="form"
        :schema="paymentVoidSchema"
        :state="state"
        class="flex flex-col gap-4"
        @submit="onSubmit"
      >
        <UFormField
          name="reason"
          label="Motivo"
          required
        >
          <UTextarea
            v-model="state.reason"
            :rows="2"
            autoresize
            class="w-full"
          />
        </UFormField>

        <div class="flex w-full flex-col gap-2 sm:flex-row-reverse">
          <UButton
            type="submit"
            label="Sí, anular pago"
            color="error"
            :loading="voiding"
            block
          />
          <UButton
            label="Volver"
            color="neutral"
            variant="outline"
            block
            @click="open = false"
          />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
