<script setup lang="ts">
import type { ButtonProps, FormSubmitEvent } from '@nuxt/ui'
import type { CustomerOption } from '~/utils/customers'
import type { Order, OrderFormOutput, OrderFormState, SavedOrder } from '~/utils/orders'
import type { Product } from '~/utils/products'

/**
 * The Order screen, one page for taking and editing an Order: Customer, Branch and Delivery date
 * on top, the lines with quantity steppers and Discounts, the Product picker (beside the lines on
 * a wide screen) and a footer that keeps the live total and Save in reach.
 *
 * With `order`, it edits that Pending Order: its Customer is fixed (`customer` gives its Branches)
 * and its lines keep their frozen prices.
 */
const props = defineProps<{ order?: Order, customer?: CustomerOption }>()
const emit = defineEmits<{ saved: [order: SavedOrder] }>()

const { request } = useApi()
const form = useTemplateRef('form')

const state = reactive<OrderFormState>(props.order
  ? orderFormStateFrom(props.order)
  : { customerId: undefined, branchId: undefined, deliveryDate: tomorrowInArgentina(), discountPercent: '', notes: '', lines: [] })

const customer = ref<CustomerOption | undefined>(props.customer)
// A Customer with a single Branch has it picked on their behalf.
watch(customer, (picked) => {
  state.customerId = picked?.id
  state.branchId = picked?.branches.length === 1 ? picked.branches[0]!.id : undefined
})
const branches = computed(() => customer.value?.branches ?? [])
const branchItems = computed(() => branches.value.map(b => ({
  value: b.id,
  label: [b.name, `${b.address}, ${b.city}`].filter(Boolean).join(' · ')
})))

const totals = computed(() => orderFormTotals(state))
const inOrder = computed(() => Object.fromEntries(state.lines.map(l => [l.productId, l.quantity])))
const units = computed(() => state.lines.reduce((sum, l) => sum + (Number.isInteger(l.quantity) ? l.quantity : 0), 0))

/** Adds one unit of the Product: a new line at its current Price, or one more on its line. */
function addProduct(product: Product) {
  const line = state.lines.find(l => l.productId === product.id)
  if (line) {
    line.quantity = (Number.isInteger(line.quantity) ? line.quantity : 0) + 1
    // Available stock now known; it already counts what this Order reserved.
    line.available = product.stock.available
    return
  }
  state.lines.push({
    productId: product.id,
    product: { id: product.id, code: product.code, name: product.name },
    unitPrice: product.price,
    quantity: 1,
    reservedByOrder: 0,
    available: product.stock.available,
    discountPercent: ''
  })
}

/** A stepper button named after its line, so a screen reader says which Product it changes. */
const stepButton = (label: string) => ({ 'aria-label': label }) as ButtonProps

function removeLine(index: number) {
  state.lines.splice(index, 1)
}

// Two taps on Save must not take the Order twice: the second one finds it saving.
const saving = ref(false)

async function onSubmit({ data }: FormSubmitEvent<OrderFormOutput>) {
  if (saving.value) return
  saving.value = true
  try {
    const order = props.order
    if (order) {
      const { customerId: _fixed, ...changes } = data
      emit('saved', await request(c => c.orders[':id'].$patch({ param: { id: order.id }, json: changes }), { form: form.value }))
    } else {
      emit('saved', await request(c => c.orders.$post({ json: data }), { form: form.value }))
    }
  } catch (error) {
    if (!(error instanceof ApiRequestError)) throw error
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UDashboardPanel id="pedido-form">
    <template #header>
      <UDashboardNavbar :title="order ? `Editar pedido N° ${order.number}` : 'Nuevo pedido'">
        <template #leading>
          <UButton
            :to="order ? `/pedidos/${order.id}` : '/pedidos'"
            icon="i-lucide-arrow-left"
            :aria-label="order ? 'Volver al pedido' : 'Volver a Pedidos'"
            color="neutral"
            variant="ghost"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UForm
        id="order-form"
        ref="form"
        :schema="orderFormSchema"
        :state="state"
        class="grid gap-6 lg:grid-cols-2 lg:items-start"
        @submit="onSubmit"
      >
        <!-- Customer, Branch and Delivery date. -->
        <div class="flex flex-col gap-4">
          <UFormField
            v-if="!order"
            label="Cliente"
            name="customerId"
          >
            <CustomerSearchMenu
              v-model="customer"
              class="w-full"
            />
          </UFormField>
          <p
            v-else
            class="flex flex-col"
          >
            <span class="text-sm text-muted">Cliente</span>
            <span class="font-medium text-highlighted">{{ order.customer.name }}</span>
          </p>

          <template v-if="customer">
            <UFormField
              v-if="branches.length > 1"
              label="Sucursal"
              name="branchId"
            >
              <USelect
                v-model="state.branchId"
                :items="branchItems"
                placeholder="Elegí la sucursal"
                class="w-full"
              />
            </UFormField>
            <p
              v-else-if="branches[0]"
              class="flex flex-col"
            >
              <span class="text-sm text-muted">Sucursal</span>
              <span>{{ branchItems[0]!.label }}</span>
            </p>
          </template>

          <UFormField
            label="Fecha de entrega"
            name="deliveryDate"
          >
            <UInput
              v-model="state.deliveryDate"
              type="date"
              class="w-full"
            />
          </UFormField>
        </div>

        <section
          aria-labelledby="productos-del-pedido"
          class="flex flex-col gap-3 lg:col-start-1"
        >
          <h2
            id="productos-del-pedido"
            class="font-semibold text-highlighted"
          >
            Productos del pedido
          </h2>

          <UFormField name="lines">
            <p
              v-if="!state.lines.length"
              class="text-sm text-muted"
            >
              Todavía no agregaste productos.
            </p>
            <ul
              v-else
              class="divide-y divide-default"
            >
              <li
                v-for="(line, index) in state.lines"
                :key="line.productId"
                class="flex flex-col gap-2 py-3"
              >
                <div class="flex items-start justify-between gap-3">
                  <span class="flex min-w-0 flex-col">
                    <span class="font-medium text-highlighted">{{ line.product.name }}</span>
                    <span class="text-sm text-muted tabular-nums">{{ line.product.code }} · {{ formatMoney(line.unitPrice) }} c/u</span>
                  </span>
                  <UButton
                    icon="i-lucide-trash-2"
                    :aria-label="`Quitar ${line.product.name}`"
                    color="neutral"
                    variant="ghost"
                    @click="removeLine(index)"
                  />
                </div>

                <div class="flex flex-wrap items-start gap-3">
                  <UFormField :name="`lines.${index}.quantity`">
                    <UInputNumber
                      v-model="line.quantity"
                      :min="1"
                      :aria-label="`Cantidad de ${line.product.name}`"
                      :increment="stepButton(`Sumar uno a ${line.product.name}`)"
                      :decrement="stepButton(`Restar uno a ${line.product.name}`)"
                      locale="es-AR"
                      class="w-36"
                    />
                  </UFormField>
                  <UFormField :name="`lines.${index}.discountPercent`">
                    <UInput
                      v-model="line.discountPercent"
                      :aria-label="`Descuento de ${line.product.name}`"
                      placeholder="Desc."
                      inputmode="decimal"
                      autocomplete="off"
                      class="w-28"
                    >
                      <template #trailing>
                        <span class="text-muted">%</span>
                      </template>
                    </UInput>
                  </UFormField>
                  <span class="ms-auto self-center font-medium text-highlighted tabular-nums">
                    {{ formatMoney(orderFormTotals({ lines: [line], discountPercent: '' }).subtotal) }}
                  </span>
                </div>

                <!-- A warning, never a block: the Order is taken even when stock is short. -->
                <p
                  v-if="(availableAfter(line) ?? 0) < 0"
                  class="flex items-center gap-1.5 text-sm text-warning"
                >
                  <UIcon
                    name="i-lucide-triangle-alert"
                    class="size-4 shrink-0"
                  />
                  Sin stock suficiente: el disponible quedaría en {{ formatUnits(availableAfter(line)!) }}
                </p>
              </li>
            </ul>
          </UFormField>
        </section>

        <div class="lg:col-start-2 lg:row-span-3 lg:row-start-1">
          <OrderProductPicker
            :in-order="inOrder"
            @add="addProduct"
          />
        </div>

        <div class="flex flex-col gap-4 lg:col-start-1">
          <UFormField
            label="Descuento del pedido"
            name="discountPercent"
            help="Se aplica después de los descuentos de cada producto."
          >
            <UInput
              v-model="state.discountPercent"
              placeholder="0"
              inputmode="decimal"
              autocomplete="off"
              class="w-28"
            >
              <template #trailing>
                <span class="text-muted">%</span>
              </template>
            </UInput>
          </UFormField>

          <UFormField
            label="Notas"
            name="notes"
          >
            <UTextarea
              v-model="state.notes"
              :rows="2"
              autoresize
              class="w-full"
            />
          </UFormField>
        </div>
      </UForm>

      <!-- The page's own overlays, e.g. the saved-Order sheet. -->
      <slot />
    </template>

    <template #footer>
      <div class="flex items-center justify-between gap-4 border-t border-default p-4 sm:px-6">
        <div class="flex flex-col">
          <span class="text-sm text-muted">
            Total<template v-if="units"> · {{ formatUnits(units) }} {{ units === 1 ? 'unidad' : 'unidades' }}</template>
          </span>
          <output
            aria-label="Total del pedido"
            aria-live="polite"
            class="text-xl font-semibold text-highlighted tabular-nums"
          >{{ formatMoney(totals.total) }}</output>
        </div>
        <UButton
          type="submit"
          form="order-form"
          :label="order ? 'Guardar cambios' : 'Guardar pedido'"
          icon="i-lucide-check"
          :loading="saving"
        />
      </div>
    </template>
  </UDashboardPanel>
</template>
