<script setup lang="ts">
import type { ProductFormState } from '~/utils/products'

/**
 * The Product's fields inside a `UForm`. The Price shows only when creating: on an existing
 * Product it changes through "Cambiar precio", so every change lands in its history.
 */
const props = defineProps<{ withPrice?: boolean }>()
const state = defineModel<ProductFormState>({ required: true })

const { data: categories } = await useCategories()
// "Sin categoría" is a choice of its own (value null, which the API reads as "clear it"): easier
// to hit on a phone than the select's small clear button, and reachable from the keyboard.
const categoryItems = computed(() => [{ id: null, name: 'Sin categoría' }, ...categories.value])
const vatRates = computed(() => vatRateItems(state.value.vatRate))
</script>

<template>
  <UFormField
    name="code"
    label="Código"
    required
  >
    <UInput
      v-model="state.code"
      autocomplete="off"
      autocapitalize="characters"
      autocorrect="off"
      spellcheck="false"
      class="w-full"
    />
  </UFormField>

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
    name="brand"
    label="Marca"
  >
    <UInput
      v-model="state.brand"
      autocomplete="off"
      class="w-full"
    />
  </UFormField>

  <UFormField
    name="categoryId"
    label="Categoría"
  >
    <USelectMenu
      v-model="state.categoryId"
      :items="categoryItems"
      value-key="id"
      label-key="name"
      placeholder="Sin categoría"
      :search-input="{ placeholder: 'Buscar categoría', autofocus: false }"
      class="w-full"
    />
  </UFormField>

  <UFormField
    v-if="props.withPrice"
    name="price"
    label="Precio"
    description="Final, con IVA incluido."
    required
  >
    <UInput
      v-model="state.price"
      inputmode="decimal"
      autocomplete="off"
      placeholder="0,00"
      icon="i-lucide-dollar-sign"
      class="w-full"
    />
  </UFormField>

  <UFormField
    name="vatRate"
    label="Alícuota de IVA"
    required
  >
    <USelect
      v-model="state.vatRate"
      :items="vatRates"
      class="w-full"
    />
  </UFormField>
</template>
