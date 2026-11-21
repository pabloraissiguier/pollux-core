<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'
import type { Product } from '~/utils/products'
import { stockAdjustmentFormSchema, stockAdjustmentFormState, stockAdjustmentReasonItems, unitsInputSchema } from '~/utils/stock'

/** Ajuste de stock: changes one Product's On-hand stock with a reason. Emits the Product. */
const props = defineProps<{ product: Product }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ saved: [product: Product] }>()

const { request } = useApi()
const toast = useToast()
const form = useTemplateRef('form')
const state = reactive(stockAdjustmentFormState())
const saving = ref(false)

const directionItems = [
  { value: 'add', label: 'Sumar', description: 'Entran unidades' },
  { value: 'remove', label: 'Restar', description: 'Salen unidades' }
]

watch(open, (isOpen) => {
  if (isOpen) Object.assign(state, stockAdjustmentFormState())
})

// Breakage only ever takes units out.
watch(() => state.reason, (reason) => {
  if (reason === 'breakage') state.direction = 'remove'
})

// What On-hand stock will be, shown while typing so a wrong direction is easy to spot.
const resultingOnHand = computed(() => {
  const quantity = unitsInputSchema.safeParse(state.quantity)
  if (!quantity.success || quantity.data === 0) return null
  const onHand = props.product.stock.onHand
  return state.direction === 'add' ? onHand + quantity.data : onHand - quantity.data
})

async function onSubmit({ data }: FormSubmitEvent<z.output<typeof stockAdjustmentFormSchema>>) {
  saving.value = true
  try {
    const product = await request(
      c => c.stock.adjustments.$post({
        json: {
          productId: props.product.id,
          quantity: data.direction === 'add' ? data.quantity : -data.quantity,
          reason: data.reason,
          notes: data.notes
        }
      }),
      { form: form.value }
    )
    emit('saved', product)
    open.value = false
    toast.add({ title: 'Stock ajustado', color: 'success', icon: 'i-lucide-check' })
  } catch (error) {
    if (!(error instanceof ApiRequestError)) throw error
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Ajustar stock"
    :description="product.name"
  >
    <template #body>
      <!-- Errors clear while typing, not on blur: a blur that removes an error moves the submit
           button up from under a finger that's already tapping it (issue #41). -->
      <UForm
        ref="form"
        :schema="stockAdjustmentFormSchema"
        :state="state"
        :validate-on="['input']"
        class="flex flex-col gap-4"
        @submit="onSubmit"
      >
        <UFormField
          name="direction"
          label="Movimiento"
        >
          <URadioGroup
            v-model="state.direction"
            :items="directionItems"
            orientation="horizontal"
            variant="card"
          />
        </UFormField>

        <UFormField
          name="quantity"
          label="Cantidad"
          :description="`Stock físico: ${formatUnits(product.stock.onHand)}${resultingOnHand === null ? '' : ` → ${formatUnits(resultingOnHand)}`}`"
          required
        >
          <UInput
            v-model="state.quantity"
            inputmode="numeric"
            autocomplete="off"
            enterkeyhint="done"
            placeholder="Unidades"
            class="w-full"
          />
        </UFormField>

        <UFormField
          name="reason"
          label="Motivo"
          required
        >
          <URadioGroup
            v-model="state.reason"
            :items="stockAdjustmentReasonItems"
          />
        </UFormField>

        <UFormField
          name="notes"
          label="Notas"
        >
          <UTextarea
            v-model="state.notes"
            :rows="2"
            autoresize
            class="w-full"
          />
        </UFormField>

        <UButton
          type="submit"
          label="Guardar ajuste"
          icon="i-lucide-check"
          :loading="saving"
          block
        />
      </UForm>
    </template>
  </UModal>
</template>
