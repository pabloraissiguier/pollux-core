import type { VatCondition } from '@pollux/contracts'
import type { InferResponseType } from 'hono/client'
import type { ApiClient } from '~/composables/useApi'

/** A Customer as the API returns it, with all its Branches (oldest first). */
export type Customer = InferResponseType<ApiClient['customers'][':id']['$get'], 200>
export type Branch = Customer['branches'][number]
/** What picking a Customer needs (for an Order, as a filter): a list item and the detail both fit. */
export type CustomerOption = Pick<Customer, 'id' | 'name' | 'branches'>

/** The fields of the Customer form, as typed (the shared schema trims and turns '' into null). */
export interface CustomerFormState {
  name: string
  legalName: string
  cuit: string
  vatCondition: VatCondition | undefined
  phone: string
  notes: string
}

/** The fields of the Branch form. */
export interface BranchFormState {
  name: string
  address: string
  city: string
  notes: string
}

export function customerFormState(customer?: Customer): CustomerFormState {
  return {
    name: customer?.name ?? '',
    legalName: customer?.legalName ?? '',
    cuit: customer?.cuit ?? '',
    vatCondition: customer?.vatCondition ?? undefined,
    phone: customer?.phone ?? '',
    notes: customer?.notes ?? ''
  }
}

export function branchFormState(branch?: Branch): BranchFormState {
  return {
    name: branch?.name ?? '',
    address: branch?.address ?? '',
    city: branch?.city ?? '',
    notes: branch?.notes ?? ''
  }
}

/** The towns of a Customer's Branches, each once, in Branch order. */
export function customerTowns(customer: Pick<Customer, 'branches'>): string[] {
  return [...new Set(customer.branches.map(b => b.city))]
}

/** A Branch in one line: its name, if any, then its address and town. */
export function branchLabel(branch: Pick<Branch, 'name' | 'address' | 'city'>): string {
  return [branch.name, `${branch.address}, ${branch.city}`].filter(Boolean).join(' · ')
}

/** A `tel:` link for a phone as people type it ("03468 15-123456"): digits and a leading +. */
export function phoneHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`
}
