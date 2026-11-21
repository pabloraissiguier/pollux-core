<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'
import { priceChangeFormSchema, type Product } from '~/utils/products'

/** Changes one Product's Price; the API keeps the change in its history. Emits the Product. */
const props = defineProps<{ product: Product }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ saved: [product: Product] }>()

const { request } = useApi()
const form = useTemplateRef('form')
const state = reactive({ price: '' })
const saving = ref(false)

watch(open, (isOpen) => {
  if (isOpen) state.price = priceForInput(props.product.price)
})

async function onSubmit({ data }: FormSubmitEvent<z.output<typeof priceChangeFormSchema>>) {
  saving.value = true
  try {
    const product = await request(
      c => c.products[':id'].$patch({ param: { id: props.product.id }, json: { price: data.price } }),
      { form: form.value }
    )
    emit('saved', product)
    open.value = false
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
