<script setup lang="ts">
import { branchSchema } from '@pollux/contracts'
import type { z } from 'zod'
import type { Branch, Customer } from '~/utils/customers'

/**
 * Adds a Branch to a Customer, or edits `branch` when given. Emits the Customer with all its
 * Branches, as the API returns it after saving.
 */
const props = defineProps<{ customerId: string, branch?: Branch | null }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ saved: [customer: Customer] }>()

const form = useTemplateRef('form')
const state = reactive(branchFormState(props.branch ?? undefined))

watch(open, (isOpen) => {
  if (isOpen) Object.assign(state, branchFormState(props.branch ?? undefined))
})

const { saving, onSubmit } = useFormSubmit<z.output<typeof branchSchema>>(form, async (data, request) => {
  const id = props.customerId
  const branchId = props.branch?.id
  const customer = branchId
    ? await request(c => c.customers[':id'].branches[':branchId'].$patch({ param: { id, branchId }, json: data }))
    : await request(c => c.customers[':id'].branches.$post({ param: { id }, json: data }))
  emit('saved', customer)
  open.value = false
})
</script>

<template>
  <UModal
    v-model:open="open"
    :title="branch ? 'Editar sucursal' : 'Agregar sucursal'"
  >
    <template #body>
      <UForm
        ref="form"
        :schema="branchSchema"
        :state="state"
        class="flex flex-col gap-4"
        @submit="onSubmit"
      >
        <UFormField
          name="address"
          label="Dirección"
          required
        >
          <UInput
            v-model="state.address"
            autocomplete="off"
            class="w-full"
          />
        </UFormField>

        <UFormField
          name="city"
          label="Localidad"
          required
        >
          <UInput
            v-model="state.city"
            autocomplete="off"
            class="w-full"
          />
        </UFormField>

        <UFormField
          name="name"
          label="Nombre de la sucursal"
          hint="Opcional"
        >
          <UInput
            v-model="state.name"
            autocomplete="off"
            placeholder="Ej.: Local centro"
            class="w-full"
          />
        </UFormField>

        <UFormField
          name="notes"
          label="Notas"
          hint="Opcional"
        >
          <UTextarea
            v-model="state.notes"
            autoresize
            placeholder="Ej.: entregar por el portón de atrás"
            class="w-full"
          />
        </UFormField>

        <UButton
          type="submit"
          :label="branch ? 'Guardar sucursal' : 'Agregar sucursal'"
          icon="i-lucide-check"
          block
          :loading="saving"
        />
      </UForm>
    </template>
  </UModal>
</template>
