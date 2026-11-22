<script setup lang="ts">
const route = useRoute()
const { request } = useApi()
const toast = useToast()
const id = String(route.params.id)

const { data: order, status } = await useAsyncData(
  `pedido-${id}`,
  () => request(c => c.orders[':id'].$get({ param: { id } }))
)

useSeoMeta({ title: () => (order.value ? `Pedido N° ${order.value.number}` : 'Pedido') })

const confirming = ref(false)
const cancelling = ref(false)
const delivering = ref(false)
const confirmingUndo = ref(false)
const undoing = ref(false)

async function cancel() {
  if (cancelling.value) return
  cancelling.value = true
  try {
    order.value = await request(c => c.orders[':id'].cancel.$post({ param: { id } }))
    confirming.value = false
    toast.add({ title: `Pedido N° ${order.value.number} cancelado`, color: 'success', icon: 'i-lucide-check' })
  } catch (error) {
    if (!(error instanceof ApiRequestError)) throw error
  } finally {
    cancelling.value = false
  }
}

async function undoDelivery() {
  if (undoing.value) return
  undoing.value = true
  try {
    order.value = await request(c => c.orders[':id']['undo-delivery'].$post({ param: { id } }))
    confirmingUndo.value = false
    toast.add({ title: `Entrega del pedido N° ${order.value.number} deshecha`, color: 'success', icon: 'i-lucide-check' })
  } catch (error) {
    if (!(error instanceof ApiRequestError)) throw error
  } finally {
    undoing.value = false
  }
}
</script>

<template>
  <UDashboardPanel id="pedido">
    <template #header>
      <UDashboardNavbar :title="order ? `Pedido N° ${order.number}` : 'Pedido'">
        <template #leading>
          <UButton
            to="/pedidos"
            icon="i-lucide-arrow-left"
            aria-label="Volver a Pedidos"
            color="neutral"
            variant="ghost"
          />
        </template>

        <template
          v-if="order"
          #trailing
        >
          <UBadge
            :label="orderStatusLabels[order.status]"
            :color="orderStatusColors[order.status]"
            variant="subtle"
          />
        </template>

        <template
          v-if="order?.status === 'pending'"
          #right
        >
          <UButton
            :to="`/pedidos/${order.id}/editar`"
            label="Editar"
            icon="i-lucide-pencil"
            color="neutral"
            variant="outline"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <USkeleton
        v-if="status === 'pending' && !order"
        class="h-48 w-full"
      />

      <UEmpty
        v-else-if="!order"
        icon="i-lucide-search-x"
        title="No encontramos el pedido"
        :actions="[{ label: 'Ver pedidos', icon: 'i-lucide-clipboard-list', to: '/pedidos' }]"
        variant="naked"
      />

      <div
        v-else
        class="flex w-full max-w-2xl flex-col gap-4"
      >
        <!-- At the customer's door this is the one action that matters, so it comes first. -->
        <UButton
          v-if="order.status === 'pending'"
          label="Entregar"
          icon="i-lucide-truck"
          block
          @click="delivering = true"
        />

        <UCard>
          <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3">
            <dt class="text-muted">
              Cliente
            </dt>
            <dd>
              <ULink
                :to="`/clientes/${order.customer.id}`"
                class="font-medium text-highlighted"
              >
                {{ order.customer.name }}
              </ULink>
            </dd>
            <dt class="text-muted">
              Sucursal
            </dt>
            <dd>{{ branchLabel(order.branch) }}</dd>
            <dt class="text-muted">
              Fecha de entrega
            </dt>
            <dd>{{ formatDate(order.deliveryDate) }}</dd>
            <template v-if="order.deliveredOn">
              <dt class="text-muted">
                Fecha entregada
              </dt>
              <dd>{{ formatDate(order.deliveredOn) }}</dd>
            </template>
            <template v-if="order.cancelledAt">
              <dt class="text-muted">
                Fecha de cancelación
              </dt>
              <dd>{{ formatDate(order.cancelledAt) }}</dd>
            </template>
            <template v-if="order.deliveryNoteNumber">
              <dt class="text-muted">
                Remito
              </dt>
              <dd>N° {{ order.deliveryNoteNumber }}</dd>
            </template>
            <template v-if="order.notes">
              <dt class="text-muted">
                Notas
              </dt>
              <dd class="whitespace-pre-line">
                {{ order.notes }}
              </dd>
            </template>
          </dl>
        </UCard>

        <UCard>
          <section aria-labelledby="pedido-productos">
            <h2
              id="pedido-productos"
              class="font-semibold text-highlighted"
            >
              Productos
            </h2>
            <ul class="divide-y divide-default">
              <li
                v-for="line in order.lines"
                :key="line.id"
                class="flex items-start justify-between gap-3 py-3"
              >
                <span class="flex min-w-0 flex-col">
                  <span class="font-medium text-highlighted">{{ line.product.name }}</span>
                  <span class="text-sm text-muted tabular-nums">
                    {{ formatUnits(line.quantity) }} × {{ formatMoney(line.unitPrice) }}<template v-if="hasDiscount(line.discountPercent)"> · Descuento {{ formatPercent(line.discountPercent) }}</template>
                  </span>
                </span>
                <span class="shrink-0 font-medium text-highlighted tabular-nums">{{ formatMoney(line.subtotal) }}</span>
              </li>
            </ul>
          </section>

          <template #footer>
            <section
              aria-label="Totales"
              class="flex flex-col gap-1 tabular-nums"
            >
              <p
                v-if="hasDiscount(order.discountPercent)"
                class="flex justify-between gap-3 text-muted"
              >
                <span>Subtotal</span><span>{{ formatMoney(order.totals.subtotal) }}</span>
              </p>
              <p
                v-if="hasDiscount(order.discountPercent)"
                class="flex justify-between gap-3 text-muted"
              >
                <span>Descuento del pedido ({{ formatPercent(order.discountPercent) }})</span><span>-{{ formatMoney(order.totals.discountAmount) }}</span>
              </p>
              <p class="flex justify-between gap-3 text-lg font-semibold text-highlighted">
                <span>Total</span><span>{{ formatMoney(order.totals.total) }}</span>
              </p>
            </section>
          </template>
        </UCard>

        <UButton
          v-if="order.status === 'delivered'"
          label="Deshacer entrega"
          icon="i-lucide-undo-2"
          color="neutral"
          variant="outline"
          class="self-start"
          @click="confirmingUndo = true"
        />

        <UButton
          v-if="order.status === 'pending'"
          label="Cancelar pedido"
          icon="i-lucide-x"
          color="error"
          variant="outline"
          class="self-start"
          @click="confirming = true"
        />

        <UModal
          v-model:open="confirming"
          :title="`¿Cancelar el pedido N° ${order.number}?`"
          description="El pedido no se va a entregar y su stock reservado se libera. No se puede deshacer."
        >
          <template #footer>
            <div class="flex w-full flex-col gap-2 sm:flex-row-reverse">
              <UButton
                label="Sí, cancelar pedido"
                color="error"
                :loading="cancelling"
                block
                @click="cancel"
              />
              <UButton
                label="Volver"
                color="neutral"
                variant="outline"
                block
                @click="confirming = false"
              />
            </div>
          </template>
        </UModal>

        <OrderDeliverSheet
          v-model:open="delivering"
          :order="order"
          @delivered="order = $event"
        />

        <UModal
          v-model:open="confirmingUndo"
          :title="`¿Deshacer la entrega del pedido N° ${order.number}?`"
          description="El pedido vuelve a Pendiente: el stock vuelve al depósito y se le descuenta el total al saldo del cliente. Los pagos registrados no se anulan: si hay que devolver un pago, anulalo aparte."
        >
          <template #footer>
            <div class="flex w-full flex-col gap-2 sm:flex-row-reverse">
              <UButton
                label="Sí, deshacer entrega"
                color="error"
                :loading="undoing"
                block
                @click="undoDelivery"
              />
              <UButton
                label="Volver"
                color="neutral"
                variant="outline"
                block
                @click="confirmingUndo = false"
              />
            </div>
          </template>
        </UModal>
      </div>
    </template>
  </UDashboardPanel>
</template>
