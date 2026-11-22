<script setup lang="ts">
import type { SavedOrder } from '~/utils/orders'

const route = useRoute()
const { request } = useApi()
const toast = useToast()
const id = String(route.params.id)

// The Order, its Customer's Branches (a Pending Order can move between them) and the Available
// stock of its Products, so a kept line warns as soon as it asks for more than there is.
const { data, status } = await useAsyncData(`pedido-${id}-editar`, async () => {
  const order = await request(c => c.orders[':id'].$get({ param: { id } }))
  const productIds = [...new Set(order.lines.map(l => l.product.id))]
  const [customer, products] = await Promise.all([
    request(c => c.customers[':id'].$get({ param: { id: order.customer.id } })),
    Promise.all(productIds.map(productId => request(c => c.products[':id'].$get({ param: { id: productId } }))))
  ])
  const available = Object.fromEntries(products.map(p => [p.id, p.stock.available]))
  return { order, customer, available }
})

useSeoMeta({ title: () => (data.value ? `Editar pedido N° ${data.value.order.number}` : 'Editar pedido') })

async function onSaved(order: SavedOrder) {
  toast.add({
    title: `Pedido N° ${order.number} actualizado`,
    description: order.warnings.length
      ? `Sin stock suficiente: ${order.warnings.map(w => `${w.product.name} (disponible ${formatUnits(w.available)})`).join(', ')}.`
      : `Total ${formatMoney(order.totals.total)}`,
    color: order.warnings.length ? 'warning' : 'success',
    icon: order.warnings.length ? 'i-lucide-triangle-alert' : 'i-lucide-check'
  })
  await navigateTo(`/pedidos/${order.id}`)
}
</script>

<template>
  <OrderForm
    v-if="data?.order.status === 'pending'"
    :order="data.order"
    :customer="data.customer"
    :available="data.available"
    @saved="onSaved"
  />

  <UDashboardPanel
    v-else
    id="pedido-editar"
  >
    <template #header>
      <UDashboardNavbar title="Editar pedido">
        <template #leading>
          <UButton
            :to="`/pedidos/${id}`"
            icon="i-lucide-arrow-left"
            aria-label="Volver al pedido"
            color="neutral"
            variant="ghost"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <USkeleton
        v-if="status === 'pending'"
        class="h-48 w-full"
      />
      <UEmpty
        v-else-if="data"
        icon="i-lucide-lock"
        :title="`El pedido N° ${data.order.number} ya no se puede editar`"
        :description="`Está ${orderStatusLabels[data.order.status].toLowerCase()}. Solo se editan los pedidos pendientes.`"
        :actions="[{ label: 'Ver pedido', to: `/pedidos/${id}` }]"
        variant="naked"
      />
      <UEmpty
        v-else
        icon="i-lucide-search-x"
        title="No encontramos el pedido"
        :actions="[{ label: 'Ver pedidos', icon: 'i-lucide-clipboard-list', to: '/pedidos' }]"
        variant="naked"
      />
    </template>
  </UDashboardPanel>
</template>
