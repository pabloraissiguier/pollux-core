<script setup lang="ts">
/** A form still loading its values: a label and a field per row, as `UFormField` lays them out. */
withDefaults(defineProps<{ fields?: number }>(), { fields: 5 })
</script>

<template>
  <div class="flex w-full max-w-xl flex-col gap-4">
    <span
      role="status"
      class="sr-only"
    >Cargando…</span>
    <div
      v-for="n in fields"
      :key="n"
      aria-hidden="true"
      class="flex flex-col gap-2"
    >
      <USkeleton class="h-4 w-28" />
      <USkeleton class="h-10 w-full" />
    </div>
  </div>
</template>
