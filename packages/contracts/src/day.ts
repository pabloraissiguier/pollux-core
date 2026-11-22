import { z } from 'zod'

/** A calendar day, `yyyy-mm-dd`. */
export const daySchema = z.iso.date({ message: 'Ingresá una fecha válida (aaaa-mm-dd)' })
