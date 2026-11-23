<script setup lang="ts">
/**
 * A thin progress bar along the top of the screen while the app waits on a page or the API
 * (`useActivity`). Quick answers don't flash it: it shows only after a short wait.
 */
const SHOW_AFTER_MS = 150

const { busy } = useActivity()
const shown = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined

watch(busy, (now) => {
  clearTimeout(timer)
  if (now) {
    timer = setTimeout(() => {
      shown.value = true
    }, SHOW_AFTER_MS)
  } else {
    shown.value = false
  }
})

onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <UProgress
    v-if="shown"
    size="2xs"
    class="fixed inset-x-0 top-0 z-50 print:hidden"
    :ui="{ base: 'rounded-none bg-transparent' }"
  />
</template>
