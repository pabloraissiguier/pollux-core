<script setup lang="ts">
import type { Product } from '~/utils/products'

/** On-hand, Reserved and Available stock side by side. Negative Available stands out. */
const props = defineProps<{ stock: Product['stock'] }>()

const short = computed(() => props.stock.available < 0)
</script>

<template>
  <div class="flex flex-col gap-2">
    <dl class="grid grid-cols-3 gap-2 text-center">
      <div class="rounded-md bg-elevated p-2">
        <dt class="text-sm text-muted">
          Físico
        </dt>
        <dd class="text-xl font-semibold text-highlighted tabular-nums">
          {{ formatUnits(stock.onHand) }}
        </dd>
      </div>
      <div class="rounded-md bg-elevated p-2">
        <dt class="text-sm text-muted">
          Reservado
        </dt>
        <dd class="text-xl font-semibold text-highlighted tabular-nums">
          {{ formatUnits(stock.reserved) }}
        </dd>
      </div>
      <div
        class="rounded-md p-2"
        :class="short ? 'bg-error/10' : 'bg-elevated'"
      >
        <dt
          class="text-sm"
          :class="short ? 'text-error' : 'text-muted'"
        >
          Disponible
        </dt>
        <dd
          class="text-xl font-semibold tabular-nums"
          :class="short ? 'text-error' : 'text-highlighted'"
        >
          {{ formatUnits(stock.available) }}
        </dd>
      </div>
    </dl>

    <!-- Not only color: the shortage is spelled out. -->
    <p
      v-if="short"
      class="flex items-center gap-1.5 text-sm text-error"
    >
      <UIcon
        name="i-lucide-triangle-alert"
        class="size-4 shrink-0"
      />
      Stock disponible negativo: faltan {{ formatUnits(-stock.available) }} unidades.
    </p>
  </div>
</template>
