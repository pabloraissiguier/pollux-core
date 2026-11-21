import { z } from 'zod'

/** `limit`/`offset` for every list endpoint, which answers `{ items, total }`. */
export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})
