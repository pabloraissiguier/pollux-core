<script setup lang="ts">
import { subtractMoney } from '@pollux/contracts'
import { debitOrCredit, statementEntryLabel } from '~/utils/balance'
import type { StatementEntry } from '~/utils/balance'

/**
 * The Statement as a sheet to hand a Customer: no app chrome, light on any device, A4 when
 * printed. It opens the browser's print dialog by itself once loaded; on a phone that dialog
 * saves a PDF or shares it. The range comes from the Statement's URL (`?desde=`, `?hasta=`).
 */
definePageMeta({ layout: false, colorMode: 'light' })

/** Entries read per request (the API's page maximum): the sheet lists the whole range. */
const PAGE_SIZE = 200

const route = useRoute()
const { request } = useApi()
const { activeBusiness } = useActiveBusiness()
const customerId = String(route.params.clienteId)

const day = (value: unknown) => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined)
const from = day(route.query.desde)
const to = day(route.query.hasta)

const { data: current } = await useAsyncData(
  `cliente-${customerId}-saldo`,
  () => request(c => c.customers[':id'].balance.$get({ param: { id: customerId } }))
)

const { data: entries, status } = await useAsyncData(`resumen-${customerId}-imprimir`, async () => {
  const all: StatementEntry[] = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await request(c => c.customers[':id'].statement.$get({
      param: { id: customerId },
      query: { from, to, limit: String(PAGE_SIZE), offset: String(offset) }
    }))
    all.push(...page.items)
    if (offset + PAGE_SIZE >= page.total) return all
  }
})

useSeoMeta({ title: () => (current.value ? `Resumen de cuenta · ${current.value.customer.name}` : 'Resumen de cuenta') })

const period = computed(() => {
  if (from && to) return `Del ${formatDate(from)} al ${formatDate(to)}`
  if (from) return `Desde el ${formatDate(from)}`
  if (to) return `Hasta el ${formatDate(to)}`
  return 'Todos los movimientos'
})

/** What the Customer owed when the range starts: the first entry's Balance before it. */
const openingRow = computed(() => {
  const first = entries.value?.[0]
  return from && first ? subtractMoney(first.balance, first.amount) : null
})

/** Where the range ends: the last entry's Balance. */
const closing = computed(() => entries.value?.at(-1)?.balance ?? null)

function print() {
  window.print()
}

const printed = ref(false)
watch(status, (value) => {
  if (value !== 'success' || printed.value) return
  printed.value = true
  // After the sheet has rendered, so the dialog shows it whole.
  nextTick(print)
}, { immediate: true })

const signed = (amount: string) => (debitOrCredit(amount).side === 'credit' ? `-${formatMoney(amount.slice(1))}` : formatMoney(amount))
</script>

<template>
  <main class="mx-auto flex w-full max-w-3xl flex-col gap-6 bg-default p-4 text-default sm:p-8 print:max-w-none print:p-0">
    <div class="flex items-center justify-between gap-2 print:hidden">
      <UButton
        :to="{ path: `/cuentas-corrientes/${customerId}`, query: route.query }"
        label="Volver al resumen"
        icon="i-lucide-arrow-left"
        color="neutral"
        variant="ghost"
      />
      <UButton
        label="Imprimir"
        icon="i-lucide-printer"
        @click="print"
      />
    </div>

    <header class="flex flex-col gap-1">
      <p class="text-sm text-muted">
        {{ activeBusiness?.name }}
      </p>
      <h1 class="text-2xl font-semibold text-highlighted">
        Resumen de cuenta
      </h1>
      <p class="text-lg text-highlighted">
        {{ current?.customer.name }}
      </p>
      <p class="text-sm text-muted">
        {{ period }} · Emitido el {{ formatDate(todayInArgentina()) }}
      </p>
    </header>

    <USkeleton
      v-if="status === 'pending'"
      class="h-48 w-full print:hidden"
    />

    <p
      v-else-if="!entries?.length"
      class="text-muted"
    >
      No hay movimientos en estas fechas.
    </p>

    <template v-else>
      <table
        aria-label="Movimientos de cuenta"
        class="w-full text-xs sm:text-sm print:text-sm"
      >
        <thead>
          <tr class="border-b border-default text-left text-muted">
            <th class="py-2 pr-2 font-medium">
              Fecha
            </th>
            <th class="py-2 pr-2 font-medium">
              Concepto
            </th>
            <th class="py-2 pr-2 text-right font-medium">
              Debe
            </th>
            <th class="py-2 pr-2 text-right font-medium">
              Haber
            </th>
            <th class="py-2 text-right font-medium">
              Saldo
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-default tabular-nums">
          <tr v-if="openingRow !== null">
            <td class="py-2 pr-2">
              {{ formatDate(from!) }}
            </td>
            <td class="py-2 pr-2">
              Saldo anterior
            </td>
            <td />
            <td />
            <td class="py-2 text-right">
              {{ signed(openingRow) }}
            </td>
          </tr>
          <tr
            v-for="entry in entries"
            :key="entry.id"
            class="break-inside-avoid"
          >
            <td class="py-2 pr-2 whitespace-nowrap">
              {{ formatDate(entry.entryDate) }}
            </td>
            <td class="py-2 pr-2">
              {{ statementEntryLabel(entry) }}
            </td>
            <td class="py-2 pr-2 text-right">
              {{ debitOrCredit(entry.amount).side === 'debit' ? formatMoney(entry.amount) : '' }}
            </td>
            <td class="py-2 pr-2 text-right">
              {{ debitOrCredit(entry.amount).side === 'credit' ? formatMoney(debitOrCredit(entry.amount).amount) : '' }}
            </td>
            <td class="py-2 text-right">
              {{ signed(entry.balance) }}
            </td>
          </tr>
        </tbody>
      </table>

      <p
        v-if="closing !== null"
        class="flex items-baseline justify-between gap-3 border-t border-default pt-3"
      >
        <span class="text-muted">Saldo final</span>
        <span
          role="status"
          aria-label="Saldo final"
          class="text-xl font-semibold text-highlighted tabular-nums"
        >{{ signed(closing) }}</span>
      </p>
      <p class="text-sm text-muted">
        Un saldo positivo es lo que el cliente debe; uno negativo, un saldo a su favor.
      </p>
    </template>
  </main>
</template>
