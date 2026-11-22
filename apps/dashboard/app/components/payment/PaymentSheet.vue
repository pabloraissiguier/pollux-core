<script setup lang="ts">
import { PAYMENT_METHODS } from '@pollux/contracts'
import type { FormError } from '@nuxt/ui'
import { statementPaymentLabels } from '~/utils/balance'
import type { CustomerOption } from '~/utils/customers'
import type { Order } from '~/utils/orders'
import { paymentFormSchema } from '~/utils/payments'
import type { Payment, PaymentChoice, PaymentFormOutput } from '~/utils/payments'

/**
 * The bottom sheet where money changes hands. With an `order` it is Entregar: it marks the
 * Pending Order Delivered in one step, with "Cuenta corriente (sin pago)" pre-selected or a
 * Payment method whose amount starts at the total. Without one it is Registrar pago for
 * `customer`: a Payment method, the amount, the Payment date. Given neither (from Inicio), it
 * asks which Customer pays first. Either way it ends showing the Customer's new Balance, and
 * emits the delivered Order or the recorded Payment.
 */
const props = defineProps<{
  order?: Pick<Order, 'id' | 'number' | 'customer' | 'totals'>
  customer?: { id: string, name: string }
}>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ delivered: [order: Order], recorded: [payment: Payment] }>()

const isDelivery = computed(() => !!props.order)
const schema = computed(() => paymentFormSchema(isDelivery.value))
/** Without an Order or a Customer, the sheet starts by asking who pays. */
const picking = computed(() => !props.order && !props.customer)
const pickedCustomer = ref<CustomerOption>()
const customer = computed(() => props.order?.customer ?? props.customer ?? pickedCustomer.value)

function validateCustomer(): FormError[] {
  return picking.value && !pickedCustomer.value ? [{ name: 'customer', message: 'Elegí un cliente' }] : []
}

const methodItems = PAYMENT_METHODS.map(value => ({ value, label: paymentMethodLabels[value] }))
const items = computed<{ value: PaymentChoice, label: string, description?: string }[]>(() => isDelivery.value
  ? [{ value: 'noPayment', label: 'Cuenta corriente (sin pago)', description: 'El total se suma al saldo del cliente.' }, ...methodItems]
  : methodItems)

const state = reactive<{ choice: PaymentChoice, amount: string, reference: string, day: string }>({
  choice: 'noPayment',
  amount: '',
  reference: '',
  day: todayInArgentina()
})
/** What happened, once it did: switches the sheet to its success state. */
const done = ref<{ payment: { method: Payment['method'], amount: string } | null } | null>(null)
/** The Customer's Balance right after, once read. */
const newBalance = ref<string | null>(null)

// Each opening starts over: no Payment when delivering, cash otherwise; the amount at the total.
watch(open, (isOpen) => {
  if (!isOpen) return
  Object.assign(state, {
    choice: isDelivery.value ? 'noPayment' : 'cash',
    amount: props.order ? priceForInput(props.order.totals.total) : '',
    reference: '',
    day: todayInArgentina()
  })
  pickedCustomer.value = undefined
  done.value = null
  newBalance.value = null
})

// A second tap while the first is in flight would deliver or pay twice. Validation errors come
// back as a toast (no form given): the API names the fields its own way (`payment.amount`).
const { saving: sending, onSubmit } = useFormSubmit<PaymentFormOutput>(null, async (data, request) => {
  if (!customer.value) return
  const payer = customer.value
  if (props.order) {
    const order = await request(c => c.orders[':id'].deliver.$post({
      param: { id: props.order!.id },
      json: { deliveredOn: data.day, payment: data.payment ?? undefined }
    }))
    emit('delivered', order)
  } else {
    const payment = data.payment!
    emit('recorded', await request(c => c.payments.$post({
      json: { customerId: payer.id, paidOn: data.day, ...payment }
    })))
  }
  done.value = { payment: data.payment }
  // It already happened: a failed Balance read only leaves the figure out.
  try {
    const { balance } = await request(c => c.customers[':id'].balance.$get({ param: { id: payer.id } }))
    newBalance.value = balance
  } catch (error) {
    if (!(error instanceof ApiRequestError)) throw error
  }
})
</script>

<template>
  <UDrawer
    v-model:open="open"
    :title="order ? `Entregar pedido N° ${order.number}` : 'Registrar pago'"
    :description="picking ? undefined : customer?.name"
  >
    <template #body>
      <div class="mx-auto flex w-full max-w-lg flex-col gap-4">
        <template v-if="done">
          <UAlert
            :title="isDelivery ? 'Pedido entregado' : 'Pago registrado'"
            :description="done.payment ? `${statementPaymentLabels[done.payment.method]} de ${formatMoney(done.payment.amount)}` : undefined"
            icon="i-lucide-circle-check"
            color="success"
            variant="subtle"
          />
          <CustomerBalanceFigure
            v-if="newBalance !== null && customer"
            :balance="newBalance"
            :label="`Saldo de ${customer.name}`"
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
          :schema="schema"
          :state="state"
          :validate="validateCustomer"
          :validate-on="['input']"
          class="flex flex-col gap-4"
          @submit="onSubmit"
        >
          <p
            v-if="order"
            class="flex items-baseline justify-between gap-3"
          >
            <span class="text-muted">Total</span>
            <span class="text-2xl font-semibold text-highlighted tabular-nums">{{ formatMoney(order.totals.total) }}</span>
          </p>

          <UFormField
            v-if="picking"
            name="customer"
            label="Cliente"
            required
          >
            <CustomerSearchMenu
              v-model="pickedCustomer"
              class="w-full"
            />
          </UFormField>

          <UFormField
            name="choice"
            :label="isDelivery ? 'Pago' : 'Medio de pago'"
          >
            <URadioGroup
              v-model="state.choice"
              :items="items"
              variant="card"
            />
          </UFormField>

          <template v-if="state.choice !== 'noPayment'">
            <UFormField
              name="amount"
              label="Importe"
              :description="isDelivery ? 'Si paga una parte, cambialo.' : undefined"
              required
            >
              <UInput
                v-model="state.amount"
                inputmode="decimal"
                autocomplete="off"
                icon="i-lucide-dollar-sign"
                class="w-full"
              />
            </UFormField>

            <UFormField
              name="reference"
              label="Referencia"
              hint="Opcional"
              description="N° de transferencia o de cheque."
            >
              <UInput
                v-model="state.reference"
                autocomplete="off"
                class="w-full"
              />
            </UFormField>
          </template>

          <UFormField
            name="day"
            :label="isDelivery ? 'Fecha entregada' : 'Fecha de pago'"
            required
          >
            <UInput
              v-model="state.day"
              type="date"
              :max="todayInArgentina()"
              class="w-full"
            />
          </UFormField>

          <UButton
            type="submit"
            :label="isDelivery ? 'Confirmar entrega' : 'Registrar pago'"
            :icon="isDelivery ? 'i-lucide-truck' : 'i-lucide-banknote'"
            :loading="sending"
            block
          />
        </UForm>
      </div>
    </template>
  </UDrawer>
</template>
