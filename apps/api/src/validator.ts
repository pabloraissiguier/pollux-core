import { zValidator } from '@hono/zod-validator'
import type { ValidationTargets } from 'hono'
import type { z } from 'zod'
import { fieldErrors, validationError } from './errors'

/**
 * `zValidator` with the API's error shape: an invalid request is a 400 `validation_error`
 * whose `details` map each field to its Spanish messages.
 */
export function validate<Target extends keyof ValidationTargets, Schema extends z.ZodType>(target: Target, schema: Schema) {
  return zValidator(target, schema, (result) => {
    if (!result.success) throw validationError(fieldErrors(result.error))
  })
}
