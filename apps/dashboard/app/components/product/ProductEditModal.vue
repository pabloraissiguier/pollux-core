<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'
import { productEditFormSchema, type Product } from '~/utils/products'

/** Edits a Product's details (not its Price). Emits the Product as the API returns it. */
const props = defineProps<{ product: Product }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ saved: [product: Product] }>()

const { request } = useApi()
const form = useTemplateRef('form')
const state = ref(productFormState(props.product))
const saving = ref(false)

// Each opening starts from what is saved, not from an edit that was abandoned.
watch(open, (isOpen) => {
  if (isOpen) state.value = productFormState(props.product)
})

async function onSubmit({ data }: FormSubmitEvent<z.output<typeof productEditFormSchema>>) {
  saving.value = true
  try {
    const product = await request(
      c => c.products[':id'].$patch({ param: { id: props.product.id }, json: data }),
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
    title="Editar producto"
  >
    <template #body>
      <UForm
        ref="form"
        :schema="productEditFormSchema"
        :state="state"
        class="flex flex-col gap-4"
        @submit="onSubmit"
      >
        <ProductFields v-model="state" />

        <UButton
          type="submit"
          label="Guardar cambios"
          icon="i-lucide-check"
          :loading="saving"
          block
        />
      </UForm>
    </template>
  </UModal>
</template>
