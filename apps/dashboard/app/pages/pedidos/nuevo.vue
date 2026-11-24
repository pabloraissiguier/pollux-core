<script setup lang="ts">
import type { SavedOrder } from '~/utils/orders'

useSeoMeta({ title: 'Nuevo pedido' })

// The saved Order, shown with its number and total so the owner can read them to the customer.
const saved = ref<SavedOrder | null>(null)
const open = ref(false)
// A new key starts a blank form for the next Order.
const formKey = ref(0)

function onSaved(order: SavedOrder) {
  saved.value = order
  open.value = true
}

// However the sheet is closed, the next Order starts blank: the saved one can't be sent twice.
watch(open, (isOpen) => {
  if (!isOpen) formKey.value++
})
</script>

<template>
  <OrderForm
    :key="formKey"
    @saved="onSaved"
    @discarded="formKey++"
  >
    <UModal
      v-model:open="open"
      :title="saved ? `Pedido N° ${saved.number} guardado` : 'Pedido guardado'"
      :description="saved ? `${saved.customer.name} · Entrega ${formatDate(saved.deliveryDate)}` : undefined"
    >
      <template #body>
        <div
          v-if="saved"
          class="flex flex-col gap-4"
        >
          <p class="flex items-baseline justify-between gap-3">
            <span class="text-muted">Total</span>
            <span class="text-2xl font-semibold text-highlighted tabular-nums">{{ formatMoney(saved.totals.total) }}</span>
          </p>

          <UAlert
            v-if="saved.warnings.length"
            color="warning"
            variant="subtle"
            icon="i-lucide-triangle-alert"
            title="Sin stock suficiente"
          >
            <template #description>
              <ul>
                <li
                  v-for="warning in saved.warnings"
                  :key="warning.lineId"
                >
                  {{ warning.product.name }}: el disponible quedó en {{ formatUnits(warning.available) }}
                </li>
              </ul>
            </template>
          </UAlert>
        </div>
      </template>

      <template #footer>
        <div class="flex w-full flex-col gap-2 sm:flex-row-reverse">
          <UButton
            label="Nuevo pedido"
            icon="i-lucide-plus"
            block
            @click="open = false"
          />
          <UButton
            v-if="saved"
            :to="`/pedidos/${saved.id}`"
            label="Ver pedido"
            color="neutral"
            variant="outline"
            block
          />
        </div>
      </template>
    </UModal>
  </OrderForm>
</template>
