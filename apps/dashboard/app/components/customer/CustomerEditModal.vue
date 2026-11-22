<script setup lang="ts">
import { customerUpdateSchema } from '@pollux/contracts'
import type { z } from 'zod'
import type { Customer } from '~/utils/customers'

/** Edits a Customer's details. Emits the Customer as the API returns it after saving. */
const props = defineProps<{ customer: Customer }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ saved: [customer: Customer] }>()

const form = useTemplateRef('form')
const state = reactive(customerFormState(props.customer))

// Each opening starts from what is saved, not from an edit that was abandoned.
watch(open, (isOpen) => {
  if (isOpen) Object.assign(state, customerFormState(props.customer))
})

const { saving, onSubmit } = useFormSubmit<z.output<typeof customerUpdateSchema>>(form, async (data, request) => {
  emit('saved', await request(c => c.customers[':id'].$patch({ param: { id: props.customer.id }, json: data })))
  open.value = false
})
</script>

<template>
  <UModal
    v-model:open="open"
    title="Editar cliente"
  >
    <template #body>
      <UForm
        ref="form"
        :schema="customerUpdateSchema"
        :state="state"
        class="flex flex-col gap-4"
        @submit="onSubmit"
      >
        <CustomerFields
          :model-value="state"
          extended
        />

        <UButton
          type="submit"
          label="Guardar cambios"
          icon="i-lucide-check"
          block
          :loading="saving"
        />
      </UForm>
    </template>
  </UModal>
</template>
