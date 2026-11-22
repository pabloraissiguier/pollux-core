import { z } from 'zod'
import { daySchema } from './orders'
import { paginationSchema } from './pagination'

/**
 * A Customer's statement (resumen de cuenta): their Balance entries in date order, optionally
 * from and/or to a day (both inclusive).
 */
export const customerStatementQuerySchema = paginationSchema
  .extend({
    from: daySchema.optional(),
    to: daySchema.optional(),
  })
  .refine(q => !q.from || !q.to || q.from <= q.to, {
    message: 'La fecha desde no puede ser posterior a la fecha hasta',
    path: ['to'],
  })
export type CustomerStatementQuery = z.input<typeof customerStatementQuerySchema>
