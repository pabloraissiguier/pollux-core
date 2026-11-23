<script setup lang="ts">
import { subtractMoney } from '@pollux/contracts'
import type { Money } from '@pollux/contracts'
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

const { data: current } = useLazyAsyncData(
  `cliente-${customerId}-saldo`,
  () => request(c => c.customers[':id'].balance.$get({ param: { id: customerId } }))
)

const statementPage = (query: { from?: string, to?: string, limit: number, offset: number }) =>
  request(c => c.customers[':id'].statement.$get({
    param: { id: customerId },
    query: { from: query.from, to: query.to, limit: String(query.limit), offset: String(query.offset) }
  }))

/**
 * The Balance at the end of a range with no entries: the last entry up to `to` (none at all is
 * zero), or the current Balance when the range is open-ended.
 */
async function balanceThrough(to: string | undefined): Promise<Money> {
  if (!to) return (await request(c => c.customers[':id'].balance.$get({ param: { id: customerId } }))).balance
  const { total } = await statementPage({ to, limit: 1, offset: 0 })
  if (total === 0) return '0.00'
  const { items } = await statementPage({ to, limit: 1, offset: total - 1 })
  return items[0]!.balance
}

const { data: sheet, status } = useLazyAsyncData(`resumen-${customerId}-imprimir`, async () => {
  const entries: StatementEntry[] = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await statementPage({ from, to, limit: PAGE_SIZE, offset })
    entries.push(...page.items)
    if (offset + PAGE_SIZE >= page.total) break
  }
  // A sheet always ends in a Balance, even for a range with no entries.
  const closing = entries.at(-1)?.balance ?? await balanceThrough(to)
  return { entries, closing }
})
const entries = computed(() => sheet.value?.entries)
/** Where the range ends. */
const closing = computed(() => sheet.value?.closing ?? null)

useSeoMeta({ title: () => (current.value ? `Resumen de cuenta · ${current.value.customer.name}` : 'Resumen de cuenta') })

const period = computed(() => {
  if (from && to) return `Del ${formatDate(from)} al ${formatDate(to)}`
  if (from) return `Desde el ${formatDate(from)}`
  if (to) return `Hasta el ${formatDate(to)}`
  return 'Todos los movimientos'
})

/** What the Customer owed when the range starts: the first entry's Balance before it. */
const balanceBefore = computed(() => {
  const first = entries.value?.[0]
  return from && first ? subtractMoney(first.balance, first.amount) : null
})

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

    <template v-else-if="sheet">
      <p
        v-if="!sheet.entries.length"
        class="text-muted"
      >
        No hay movimientos en estas fechas.
      </p>
      <table
        v-else
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
          <tr v-if="balanceBefore !== null">
            <td class="py-2 pr-2">
              {{ formatDate(from!) }}
            </td>
            <td class="py-2 pr-2">
              Saldo anterior
            </td>
            <td />
            <td />
            <td class="py-2 text-right">
              {{ formatMoney(balanceBefore) }}
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
              {{ formatMoney(entry.balance) }}
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
        >{{ formatMoney(closing) }}</span>
      </p>
      <p class="text-sm text-muted">
        Un saldo positivo es lo que el cliente debe; uno negativo, un saldo a su favor.
      </p>
    </template>
  </main>
</template>
