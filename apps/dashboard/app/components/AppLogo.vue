<script setup lang="ts">
defineProps<{ collapsed?: boolean }>()
</script>

<template>
  <NuxtLink
    to="/"
    class="flex items-center gap-2 rounded-md font-semibold text-highlighted"
  >
    <UIcon
      name="i-lucide-package"
      class="size-6 shrink-0 text-primary"
    />
    <span v-if="!collapsed">Pollux</span>
  </NuxtLink>
</template>
