<script setup lang="ts">
import { VAT_CONDITIONS } from '@pollux/contracts'
import type { CustomerFormState } from '~/utils/customers'

/**
 * A Customer's details, inside a `UForm` whose schema has these fields. `extended` adds the
 * legal name and notes, which registering a new Customer on the road doesn't need.
 * Autocomplete is off: the fields describe someone else, not the owner the browser knows.
 */
defineProps<{ extended?: boolean }>()
const model = defineModel<CustomerFormState>({ required: true })

const vatConditions = VAT_CONDITIONS.map(value => ({ value, label: vatConditionLabels[value] }))
</script>

<template>
  <UFormField
    name="name"
    label="Nombre"
    required
  >
    <UInput
      v-model="model.name"
      autocomplete="off"
      class="w-full"
    />
  </UFormField>

  <UFormField
    v-if="extended"
    name="legalName"
    label="Razón social"
  >
    <UInput
      v-model="model.legalName"
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
      :model-value="model.cuit"
      inputmode="numeric"
      autocomplete="off"
      autocorrect="off"
      spellcheck="false"
      placeholder="XX-XXXXXXXX-X"
      class="w-full"
      @update:model-value="value => model.cuit = maskCuit(String(value ?? ''))"
    />
  </UFormField>

  <UFormField
    name="vatCondition"
    label="Condición frente al IVA"
    hint="Opcional"
  >
    <USelect
      v-model="model.vatCondition"
      :items="vatConditions"
      placeholder="Sin especificar"
      class="w-full"
    />
  </UFormField>

  <UFormField
    name="phone"
    label="Teléfono"
    hint="Opcional"
  >
    <UInput
      v-model="model.phone"
      type="tel"
      autocomplete="off"
      class="w-full"
    />
  </UFormField>

  <UFormField
    v-if="extended"
    name="notes"
    label="Notas"
  >
    <UTextarea
      v-model="model.notes"
      autoresize
      class="w-full"
    />
  </UFormField>
</template>
