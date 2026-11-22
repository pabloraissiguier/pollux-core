<script setup lang="ts">
import type { Money } from '@pollux/contracts'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'
import { balanceAdjustmentFormSchema, balanceAfter, manualEntryFormState, openingBalanceFormSchema, signedBalanceAmount } from '~/utils/balance'
import type { BalanceEntryKind, BalanceSide } from '~/utils/balance'

/**
 * A manual Balance entry for one Customer: the Opening balance (`kind: 'opening'`, once, from
 * the Excel sheet) or a Balance adjustment (`kind: 'adjustment'`, with its required reason).
 * The amount is typed without a sign and its side chosen apart. Emits `saved` with the new
 * Balance; `kind: 'opening'` also emits it when the API says the Customer already has one.
 */
const props = defineProps<{
  kind: BalanceEntryKind
  customer: { id: string, name: string }
  balance: Money
}>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ saved: [balance: Money | null] }>()

const { request } = useApi()
const toast = useToast()
const form = useTemplateRef('form')

const isOpening = computed(() => props.kind === 'opening')
const schema = computed(() => (isOpening.value ? openingBalanceFormSchema : balanceAdjustmentFormSchema))
const state = reactive(manualEntryFormState('debit'))
const saving = ref(false)

const sideItems = computed<{ value: BalanceSide, label: string, description: string }[]>(() => isOpening.value
  ? [
      { value: 'debit', label: 'Debe', description: 'Le debe al negocio' },
      { value: 'credit', label: 'A favor', description: 'Tiene saldo a favor' }
    ]
  : [
      { value: 'debit', label: 'Sumar al saldo', description: 'Debe más' },
      { value: 'credit', label: 'Restar del saldo', description: 'Debe menos' }
    ])

watch(open, (isOpen) => {
  if (isOpen) Object.assign(state, manualEntryFormState('debit'))
})

// The Balance it leaves, shown while typing so a wrong side is easy to spot.
const resulting = computed(() => balanceAfter(props.balance, state.side, state.amount))

type FormOutput = z.output<typeof balanceAdjustmentFormSchema> | z.output<typeof openingBalanceFormSchema>

async function onSubmit({ data }: FormSubmitEvent<FormOutput>) {
  // A second tap in flight would record the entry twice.
  if (saving.value) return
  saving.value = true
  const amount = signedBalanceAmount(data.side, data.amount)
  const param = { id: props.customer.id }
  try {
    const saved = 'reason' in data
      ? await request(c => c.customers[':id']['balance-adjustments'].$post({
          param,
          json: { amount, reason: data.reason, entryDate: data.entryDate }
        }), { form: form.value })
      : await request(c => c.customers[':id']['opening-balance'].$post({
          param,
          json: { amount, entryDate: data.entryDate }
        }), { form: form.value })
    emit('saved', saved.balance)
    open.value = false
    toast.add({
      title: isOpening.value ? 'Saldo inicial cargado' : 'Saldo ajustado',
      color: 'success',
      icon: 'i-lucide-check'
    })
  } catch (error) {
    if (!(error instanceof ApiRequestError)) throw error
    // Someone else loaded it first: the option goes away (the toast already says why).
    if (error.code === 'opening_balance_exists') {
      emit('saved', null)
      open.value = false
    }
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="isOpening ? 'Saldo inicial' : 'Ajustar saldo'"
    :description="customer.name"
  >
    <template #body>
      <UForm
        ref="form"
        :schema="schema"
        :state="state"
        :validate-on="['input']"
        class="flex flex-col gap-4"
        @submit="onSubmit"
      >
        <p
          v-if="isOpening"
          class="text-sm text-muted"
        >
          Lo que debía antes de empezar a usar Pollux, por ejemplo de la planilla de Excel. Se carga una sola vez.
        </p>

        <UFormField
          name="side"
          :label="isOpening ? 'El cliente' : 'Movimiento'"
        >
          <URadioGroup
            v-model="state.side"
            :items="sideItems"
            orientation="horizontal"
            variant="card"
          />
        </UFormField>

        <UFormField
          name="amount"
          label="Importe"
          :description="`Saldo: ${formatMoney(balance)}${resulting === null ? '' : ` → ${formatMoney(resulting)}`}`"
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
          v-if="!isOpening"
          name="reason"
          label="Motivo"
          description="Por ejemplo: incobrable, error de carga."
          required
        >
          <UInput
            v-model="state.reason"
            autocomplete="off"
            class="w-full"
          />
        </UFormField>

        <UFormField
          name="entryDate"
          label="Fecha"
          required
        >
          <UInput
            v-model="state.entryDate"
            type="date"
            :max="todayInArgentina()"
            class="w-full"
          />
        </UFormField>

        <UButton
          type="submit"
          :label="isOpening ? 'Guardar saldo inicial' : 'Guardar ajuste'"
          icon="i-lucide-check"
          :loading="saving"
          block
        />
      </UForm>
    </template>
  </UModal>
</template>
