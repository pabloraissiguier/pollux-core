<script setup lang="ts">
import { daySchema } from '@pollux/contracts'
import type { FormSubmitEvent } from '@nuxt/ui'
import { z } from 'zod'
import type { Order } from '~/utils/orders'

/**
 * Entregar: the bottom sheet that marks a Pending Order Delivered in one step, from the Order or
 * the reparto list. It shows the total, the Payment choice and the Delivered date (today by
 * default), and once delivered, the Customer's new Balance. Emits the delivered Order.
 *
 * "Cuenta corriente (sin pago)" is the only choice for now: Payment methods at the door come with
 * #21, as more items of the same radio group.
 */
const props = defineProps<{ order: Pick<Order, 'id' | 'number' | 'customer' | 'totals'> }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ delivered: [order: Order] }>()

const { request } = useApi()
const form = useTemplateRef('form')

const paymentItems = [
  { value: 'account', label: 'Cuenta corriente (sin pago)', description: 'El total se suma al saldo del cliente.' }
] as const
type PaymentChoice = (typeof paymentItems)[number]['value']

const schema = z.object({
  payment: z.enum(['account']),
  deliveredOn: daySchema.refine(day => day <= todayInArgentina(), { message: 'La fecha entregada no puede ser futura' })
})

const state = reactive<{ payment: PaymentChoice, deliveredOn: string }>({ payment: 'account', deliveredOn: todayInArgentina() })
const delivering = ref(false)
/** Whether the Order went out: switches the sheet to its success state. */
const delivered = ref(false)
/** The Customer's Balance right after delivering, once read. */
const newBalance = ref<string | null>(null)

// Each opening starts over, with today's date.
watch(open, (isOpen) => {
  if (!isOpen) return
  Object.assign(state, { payment: 'account', deliveredOn: todayInArgentina() })
  delivered.value = false
  newBalance.value = null
})

async function onSubmit({ data }: FormSubmitEvent<z.output<typeof schema>>) {
  // A second tap while the first is in flight would try to deliver twice.
  if (delivering.value) return
  delivering.value = true
  try {
    const order = await request(
      c => c.orders[':id'].deliver.$post({ param: { id: props.order.id }, json: { deliveredOn: data.deliveredOn } }),
      { form: form.value }
    )
    delivered.value = true
    emit('delivered', order)
    // The delivery already happened: a failed Balance read only leaves the figure out.
    try {
      const { balance } = await request(c => c.customers[':id'].balance.$get({ param: { id: order.customer.id } }))
      newBalance.value = balance
    } catch (error) {
      if (!(error instanceof ApiRequestError)) throw error
    }
  } catch (error) {
    if (!(error instanceof ApiRequestError)) throw error
  } finally {
    delivering.value = false
  }
}
</script>

<template>
  <UDrawer
    v-model:open="open"
    :title="`Entregar pedido N° ${order.number}`"
    :description="order.customer.name"
  >
    <template #body>
      <div class="mx-auto flex w-full max-w-lg flex-col gap-4">
        <template v-if="delivered">
          <UAlert
            title="Pedido entregado"
            icon="i-lucide-circle-check"
            color="success"
            variant="subtle"
          />
          <CustomerBalanceFigure
            v-if="newBalance !== null"
            :balance="newBalance"
            :label="`Saldo de ${order.customer.name}`"
            class="py-2"
          />
          <UButton
            label="Listo"
            block
            @click="open = false"
          />
        </template>

        <UForm
          v-else
          ref="form"
          :schema="schema"
          :state="state"
          :validate-on="['input']"
          class="flex flex-col gap-4"
          @submit="onSubmit"
        >
          <p class="flex items-baseline justify-between gap-3">
            <span class="text-muted">Total</span>
            <span class="text-2xl font-semibold text-highlighted tabular-nums">{{ formatMoney(order.totals.total) }}</span>
          </p>

          <UFormField
            name="payment"
            label="Pago"
          >
            <URadioGroup
              v-model="state.payment"
              :items="[...paymentItems]"
              variant="card"
            />
          </UFormField>

          <UFormField
            name="deliveredOn"
            label="Fecha entregada"
            required
          >
            <UInput
              v-model="state.deliveredOn"
              type="date"
              :max="todayInArgentina()"
              class="w-full"
            />
          </UFormField>

          <UButton
            type="submit"
            label="Confirmar entrega"
            icon="i-lucide-truck"
            :loading="delivering"
            block
          />
        </UForm>
      </div>
    </template>
  </UDrawer>
</template>
