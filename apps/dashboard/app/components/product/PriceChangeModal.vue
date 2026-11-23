<script setup lang="ts">
import type { z } from 'zod'
import { priceChangeFormSchema, type Product } from '~/utils/products'

/** Changes one Product's Price; the API keeps the change in its history. Emits the Product. */
const props = defineProps<{ product: Product }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ saved: [product: Product] }>()

const form = useTemplateRef('form')
const state = reactive({ price: '' })

watch(open, (isOpen) => {
  if (isOpen) state.price = priceForInput(props.product.price)
})

const { saving, onSubmit } = useFormSubmit<z.output<typeof priceChangeFormSchema>>(form, async (data, request) => {
  emit('saved', await request(c => c.products[':id'].$patch({ param: { id: props.product.id }, json: { price: data.price } })))
  open.value = false
})
</script>

<template>
  <UModal
    v-model:open="open"
    title="Cambiar precio"
    :description="product.name"
  >
    <template #body>
      <UForm
        ref="form"
        :schema="priceChangeFormSchema"
        :state="state"
        class="flex flex-col gap-4"
        @submit="onSubmit"
      >
        <UFormField
          name="price"
          label="Precio nuevo"
          :description="`Actual: ${formatMoney(product.price)}. Final, con IVA incluido.`"
          required
        >
          <UInput
            v-model="state.price"
            inputmode="decimal"
            autocomplete="off"
            icon="i-lucide-dollar-sign"
            class="w-full"
          />
        </UFormField>

        <UButton
          type="submit"
          label="Guardar precio"
          icon="i-lucide-check"
          :loading="saving"
          block
        />
      </UForm>
    </template>
  </UModal>
</template>
