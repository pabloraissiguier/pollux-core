<script setup lang="ts">
import { categorySchema } from '@pollux/contracts'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'
import type { Category } from '~/utils/products'

/** Creates a Category, or renames `category` when given. Emits it as the API returns it. */
const props = defineProps<{ category?: Category | null }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ saved: [category: Category] }>()

const { request } = useApi()
const form = useTemplateRef('form')
const state = reactive({ name: '' })
const saving = ref(false)

watch(open, (isOpen) => {
  if (isOpen) state.name = props.category?.name ?? ''
})

async function onSubmit({ data }: FormSubmitEvent<z.output<typeof categorySchema>>) {
  saving.value = true
  try {
    const category = props.category
      ? await request(c => c.categories[':id'].$patch({ param: { id: props.category!.id }, json: data }), { form: form.value })
      : await request(c => c.categories.$post({ json: data }), { form: form.value })
    emit('saved', category)
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
    :title="category ? 'Renombrar categoría' : 'Nueva categoría'"
  >
    <template #body>
      <UForm
        ref="form"
        :schema="categorySchema"
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

        <UButton
          type="submit"
          :label="category ? 'Guardar nombre' : 'Crear categoría'"
          icon="i-lucide-check"
          :loading="saving"
          block
        />
      </UForm>
    </template>
  </UModal>
</template>
