<script setup lang="ts">
/**
 * A detail page still loading (a Customer, an Order, a Product, a Purchase): the cards it will
 * show, the first with a large figure and its actions, so the layout is in place before the data.
 */
withDefaults(defineProps<{ cards?: number }>(), { cards: 2 })
</script>

<template>
  <div class="flex w-full max-w-2xl flex-col gap-4">
    <span
      role="status"
      class="sr-only"
    >Cargando…</span>

    <UCard aria-hidden="true">
      <div class="flex flex-col gap-3">
        <USkeleton class="h-3 w-24" />
        <USkeleton class="h-9 w-44" />
        <div class="flex flex-wrap gap-2 pt-1">
          <USkeleton class="h-10 w-36" />
          <USkeleton class="h-10 w-28" />
        </div>
      </div>
    </UCard>

    <UCard
      v-for="n in cards - 1"
      :key="n"
      aria-hidden="true"
    >
      <div class="flex flex-col gap-3">
        <USkeleton class="h-5 w-32" />
        <USkeleton class="h-4 w-full" />
        <USkeleton class="h-4 w-4/5" />
        <USkeleton class="h-4 w-3/5" />
      </div>
    </UCard>
  </div>
</template>
