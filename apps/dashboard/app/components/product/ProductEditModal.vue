<script setup lang="ts">
import type { z } from 'zod'
import { productEditFormSchema, type Product } from '~/utils/products'

/** Edits a Product's details (not its Price). Emits the Product as the API returns it. */
const props = defineProps<{ product: Product }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ saved: [product: Product] }>()

const form = useTemplateRef('form')
const state = ref(productFormState(props.product))

// Each opening starts from what is saved, not from an edit that was abandoned.
watch(open, (isOpen) => {
  if (isOpen) state.value = productFormState(props.product)
})

const { saving, onSubmit } = useFormSubmit<z.output<typeof productEditFormSchema>>(form, async (data, request) => {
  emit('saved', await request(c => c.products[':id'].$patch({ param: { id: props.product.id }, json: data })))
  open.value = false
})
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
