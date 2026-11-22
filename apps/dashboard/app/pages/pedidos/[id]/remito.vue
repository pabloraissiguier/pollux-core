<script setup lang="ts">
/**
 * The Order's Delivery note (Remito) as a sheet that travels with the goods: no app chrome, light
 * on any device, A4 when printed. Opening it issues the Delivery note, which takes the business's
 * next number the first time only, so a reprint shows the same number. It opens the browser's
 * print dialog by itself once loaded; on a phone that dialog saves a PDF or shares it.
 */
definePageMeta({ layout: false, colorMode: 'light' })

const route = useRoute()
const { request } = useApi()
const id = String(route.params.id)

const { data: note, status } = await useAsyncData(
  `pedido-${id}-remito`,
  () => request(c => c.orders[':id']['delivery-note'].$post({ param: { id } }))
)

useSeoMeta({ title: () => (note.value ? `Remito N° ${note.value.number}` : 'Remito') })

function print() {
  window.print()
}

const printed = ref(false)
watch(status, (value) => {
  if (value !== 'success' || !note.value || printed.value) return
  printed.value = true
  // After the sheet has rendered, so the dialog shows it whole.
  nextTick(print)
}, { immediate: true })
</script>

<template>
  <main class="mx-auto flex w-full max-w-3xl flex-col gap-6 bg-default p-4 text-default sm:p-8 print:max-w-none print:p-0">
    <div class="flex items-center justify-between gap-2 print:hidden">
      <UButton
        :to="`/pedidos/${id}`"
        label="Volver al pedido"
        icon="i-lucide-arrow-left"
        color="neutral"
        variant="ghost"
      />
      <UButton
        v-if="note"
        label="Imprimir"
        icon="i-lucide-printer"
        @click="print"
      />
    </div>

    <USkeleton
      v-if="status === 'pending'"
      class="h-48 w-full print:hidden"
    />

    <UEmpty
      v-else-if="!note"
      icon="i-lucide-file-x"
      title="No se pudo emitir el remito"
      description="Volvé al pedido para ver su estado."
      variant="naked"
    />

    <template v-else>
      <header class="flex flex-wrap items-start justify-between gap-4 border-b border-default pb-4">
        <div class="flex flex-col gap-1">
          <p class="text-lg font-semibold text-highlighted">
            {{ note.business.name }}
          </p>
          <p
            v-if="note.business.cuit"
            class="text-sm text-muted"
          >
            CUIT {{ maskCuit(note.business.cuit) }}
          </p>
        </div>
        <div class="flex flex-col gap-1 sm:items-end">
          <h1 class="text-2xl font-semibold text-highlighted">
            Remito N° {{ note.number }}
          </h1>
          <p class="text-sm text-muted">
            Fecha {{ formatDate(note.issuedAt) }}
          </p>
          <p class="text-sm text-muted">
            Pedido N° {{ note.order.number }}
          </p>
        </div>
      </header>

      <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt class="text-muted">
          Cliente
        </dt>
        <dd class="font-medium text-highlighted">
          {{ note.customer.name }}
        </dd>
        <template v-if="note.customer.legalName">
          <dt class="text-muted">
            Razón social
          </dt>
          <dd>{{ note.customer.legalName }}</dd>
        </template>
        <template v-if="note.customer.cuit || note.customer.vatCondition">
          <dt class="text-muted">
            Fiscal
          </dt>
          <dd>
            {{ [note.customer.cuit && `CUIT ${maskCuit(note.customer.cuit)}`, note.customer.vatCondition && vatConditionLabels[note.customer.vatCondition]].filter(Boolean).join(' · ') }}
          </dd>
        </template>
        <dt class="text-muted">
          Sucursal
        </dt>
        <dd>{{ branchLabel(note.branch) }}</dd>
        <dt class="text-muted">
          {{ note.order.deliveredOn ? 'Fecha entregada' : 'Fecha de entrega' }}
        </dt>
        <dd>{{ formatDate(note.order.deliveredOn ?? note.order.deliveryDate) }}</dd>
      </dl>

      <table
        aria-label="Productos"
        class="w-full text-xs sm:text-sm print:text-sm"
      >
        <thead>
          <tr class="border-b border-default text-left text-muted">
            <th class="py-2 pr-2 text-right font-medium">
              Cant.
            </th>
            <th class="py-2 pr-2 font-medium">
              Producto
            </th>
            <th class="py-2 pr-2 text-right font-medium">
              Precio
            </th>
            <th class="py-2 pr-2 text-right font-medium">
              Desc.
            </th>
            <th class="py-2 text-right font-medium">
              Subtotal
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-default tabular-nums">
          <tr
            v-for="line in note.lines"
            :key="line.id"
            class="break-inside-avoid"
          >
            <td class="py-2 pr-2 text-right align-top">
              {{ formatUnits(line.quantity) }}
            </td>
            <td class="py-2 pr-2 align-top">
              <span class="block">{{ line.product.name }}</span>
              <span class="block text-muted">{{ line.product.code }}</span>
            </td>
            <td class="py-2 pr-2 text-right align-top whitespace-nowrap">
              {{ formatMoney(line.unitPrice) }}
            </td>
            <td class="py-2 pr-2 text-right align-top whitespace-nowrap">
              {{ hasDiscount(line.discountPercent) ? formatPercent(line.discountPercent) : '' }}
            </td>
            <td class="py-2 text-right align-top whitespace-nowrap">
              {{ formatMoney(line.subtotal) }}
            </td>
          </tr>
        </tbody>
      </table>

      <section
        aria-label="Totales"
        class="flex flex-col gap-1 border-t border-default pt-3 tabular-nums"
      >
        <template v-if="hasDiscount(note.order.discountPercent)">
          <p class="flex justify-between gap-3 text-muted">
            <span>Subtotal</span><span>{{ formatMoney(note.totals.subtotal) }}</span>
          </p>
          <p class="flex justify-between gap-3 text-muted">
            <span>Descuento del pedido ({{ formatPercent(note.order.discountPercent) }})</span><span>-{{ formatMoney(note.totals.discountAmount) }}</span>
          </p>
        </template>
        <p class="flex items-baseline justify-between gap-3">
          <span class="text-muted">Total</span>
          <span
            role="status"
            aria-label="Total"
            class="text-xl font-semibold text-highlighted"
          >{{ formatMoney(note.totals.total) }}</span>
        </p>
      </section>

      <p
        v-if="note.order.notes"
        class="text-sm whitespace-pre-line"
      >
        <span class="text-muted">Notas:</span> {{ note.order.notes }}
      </p>

      <footer class="mt-8 flex flex-col gap-6 text-sm break-inside-avoid">
        <p class="w-64 max-w-full border-t border-default pt-1 text-muted">
          Recibí conforme: firma y aclaración
        </p>
        <p class="text-xs text-muted">
          Documento no válido como factura.
        </p>
      </footer>
    </template>
  </main>
</template>
