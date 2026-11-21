<script setup lang="ts">
import { customerUpdateSchema } from '@pollux/contracts'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'
import type { Customer } from '~/utils/customers'

/** Edits a Customer's details. Emits the Customer as the API returns it after saving. */
const props = defineProps<{ customer: Customer }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ saved: [customer: Customer] }>()

const { request } = useApi()
const form = useTemplateRef('form')
const state = reactive(customerFormState(props.customer))

// Each opening starts from what is saved, not from an edit that was abandoned.
watch(open, (isOpen) => {
  if (isOpen) Object.assign(state, customerFormState(props.customer))
})

async function onSubmit({ data }: FormSubmitEvent<z.output<typeof customerUpdateSchema>>) {
  try {
    const customer = await request(
      c => c.customers[':id'].$patch({ param: { id: props.customer.id }, json: data }),
      { form: form.value }
    )
    emit('saved', customer)
    open.value = false
  } catch (error) {
    if (!(error instanceof ApiRequestError)) throw error
  }
}
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
        />
      </UForm>
    </template>
  </UModal>
</template>
