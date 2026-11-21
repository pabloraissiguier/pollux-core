import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { core } from 'zod'

/** Per-field validation messages, keyed by the field's path (`lines.0.quantity`). */
export type FieldErrors = Record<string, string[]>

/**
 * Every error leaves the API as `{ error: { code, message, details? } }`.
 * `code` is a stable English slug the dashboard can react to; `message` is Spanish, for users.
 */
export class ApiError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
  }
}

export const unauthorized = () => new ApiError(401, 'unauthorized', 'Iniciá sesión para continuar')

export const notAMember = () => new ApiError(403, 'not_a_member', 'No tenés acceso a este negocio')

export function validationError(details: FieldErrors) {
  return new ApiError(400, 'validation_error', 'Revisá los datos ingresados', details)
}

export function fieldErrors(error: core.$ZodError, prefix?: string): FieldErrors {
  const out: FieldErrors = {}
  for (const issue of error.issues) {
    const key = [prefix, ...issue.path.map(String)].filter(Boolean).join('.') || '_'
    ;(out[key] ??= []).push(issue.message)
  }
  return out
}

function body(error: ApiError) {
  return {
    error: {
      code: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    },
  }
}

export function handleError(err: Error, c: Context) {
  if (err instanceof ApiError) return c.json(body(err), err.status)
  // e.g. a malformed JSON body, thrown by the validator before our hook runs.
  if (err instanceof HTTPException && err.status < 500) {
    return c.json(body(new ApiError(err.status, 'bad_request', 'La solicitud no es válida')), err.status)
  }
  console.error(err)
  return c.json(body(new ApiError(500, 'internal_error', 'Ocurrió un error inesperado. Probá de nuevo.')), 500)
}

export function handleNotFound(c: Context) {
  return c.json(body(new ApiError(404, 'not_found', 'No encontramos lo que buscabas')), 404)
}
