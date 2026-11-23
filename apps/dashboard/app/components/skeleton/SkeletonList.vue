<script setup lang="ts">
/**
 * A list still loading, shaped like the app's rows (a title, a muted line and, with `trailing`,
 * an amount and a badge on the right), so the screen doesn't jump when the rows arrive.
 * Screen readers hear one "Cargando…" instead of every placeholder.
 */
withDefaults(defineProps<{ rows?: number, trailing?: boolean }>(), { rows: 6, trailing: false })

// Uneven title widths read as text rather than as a grid of bars.
const TITLE_WIDTHS = ['w-3/5', 'w-2/5', 'w-1/2', 'w-2/3']
</script>

<template>
  <div class="w-full">
    <span
      role="status"
      class="sr-only"
    >Cargando…</span>
    <ul
      aria-hidden="true"
      class="divide-y divide-default"
    >
      <li
        v-for="n in rows"
        :key="n"
        class="flex items-center justify-between gap-3 py-3"
      >
        <div class="flex min-w-0 flex-1 flex-col gap-2">
          <USkeleton :class="['h-4', TITLE_WIDTHS[n % TITLE_WIDTHS.length]]" />
          <USkeleton class="h-3 w-1/3" />
        </div>
        <div
          v-if="trailing"
          class="flex shrink-0 flex-col items-end gap-2"
        >
          <USkeleton class="h-4 w-20" />
          <USkeleton class="h-4 w-14 rounded-full" />
        </div>
      </li>
    </ul>
  </div>
</template>
