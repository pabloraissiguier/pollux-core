<script setup lang="ts">
import { supplierCreateSchema } from '@pollux/contracts'
import type { z } from 'zod'
import type { Supplier } from '~/utils/purchases'

/**
 * Creates a Supplier, or edits `supplier` when given. Emits it as the API returns it. Both send
 * every field (the create schema), so a field left blank on an edit is cleared (`null`).
 */
const props = defineProps<{ supplier?: Supplier | null }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ saved: [supplier: Supplier] }>()

const form = useTemplateRef('form')
const state = reactive(supplierFormState(props.supplier))

// Each opening starts from what is saved, not from an edit that was abandoned.
watch(open, (isOpen) => {
  if (isOpen) Object.assign(state, supplierFormState(props.supplier))
})

const { saving, onSubmit } = useFormSubmit<z.output<typeof supplierCreateSchema>>(form, async (data, request) => {
  const supplier = props.supplier
    ? await request(c => c.suppliers[':id'].$patch({ param: { id: props.supplier!.id }, json: data }))
    : await request(c => c.suppliers.$post({ json: data }))
  emit('saved', supplier)
  open.value = false
})
</script>

<template>
  <UModal
    v-model:open="open"
    :title="supplier ? 'Editar proveedor' : 'Nuevo proveedor'"
  >
    <template #body>
      <!-- Autocomplete is off: the fields describe another business, not the owner. -->
      <UForm
        ref="form"
        :schema="supplierCreateSchema"
        :state="state"
        class="flex flex-col gap-4"
        @submit="onSubmit"
      >
        <UFormField
          name="name"
          label="Nombre"
          required
        >
          <UInput
            v-model="state.name"
            autocomplete="off"
            class="w-full"
          />
        </UFormField>

        <UFormField
          name="cuit"
          label="CUIT"
          hint="Opcional"
        >
          <UInput
            :model-value="state.cuit"
            inputmode="numeric"
            autocomplete="off"
            autocorrect="off"
            spellcheck="false"
            placeholder="XX-XXXXXXXX-X"
            class="w-full"
            @update:model-value="value => state.cuit = maskCuit(String(value ?? ''))"
          />
        </UFormField>

        <UFormField
          name="phone"
          label="Teléfono"
          hint="Opcional"
        >
          <UInput
            v-model="state.phone"
            type="tel"
            autocomplete="off"
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
            class="w-full"
          />
        </UFormField>

        <UButton
          type="submit"
          :label="supplier ? 'Guardar cambios' : 'Crear proveedor'"
          icon="i-lucide-check"
          :loading="saving"
          block
        />
      </UForm>
    </template>
  </UModal>
</template>
