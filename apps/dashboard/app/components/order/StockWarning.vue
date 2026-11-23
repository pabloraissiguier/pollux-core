<script setup lang="ts">
/**
 * "Sin stock suficiente": a Product's Available stock is below zero, with the units missing to
 * serve every Pending Order. The one wording for the Order form, the Order page and Inicio. A
 * warning, never a block. `projected` says it is the stock the Order being typed would leave.
 */
const props = defineProps<{ available: number, projected?: boolean }>()

const missing = computed(() => -props.available)
</script>

<template>
  <!-- Icon and text, never color alone. -->
  <p class="flex items-center gap-1.5 text-sm text-warning">
    <UIcon
      name="i-lucide-triangle-alert"
      class="size-4 shrink-0"
    />
    <span>
      Sin stock suficiente: {{ projected ? 'el disponible quedaría en' : 'disponible' }} {{ formatUnits(available) }},
      {{ missing === 1 ? 'falta' : 'faltan' }} {{ formatUnits(missing) }}
    </span>
  </p>
</template>
