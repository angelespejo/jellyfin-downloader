import { getConfig } from './config.js'
import { JellyfinError } from './jellyfin.js'
import { JobError } from './jobs.js'
import { PlanError } from './plan.js'
import { SettingsConflictError, SettingsValidationError } from './settings.js'
import type { ApiErrorBody } from '#lib/types.js'
import { logEvent } from './logger.js'

export class ApiRequestError extends Error {
  readonly status: number
  readonly code: string

  constructor(message: string, status = 400, code = 'INVALID_REQUEST') {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
    this.code = code
  }
}

export function jsonResponse(data: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  const headers = new Headers(extraHeaders)
  headers.set('Content-Type', 'application/json; charset=utf-8')
  headers.set('Cache-Control', 'no-store')
  return new Response(JSON.stringify(data), { status, headers })
}

export function apiError(error: unknown): Response {
  let status = 500
  let code = 'INTERNAL_ERROR'
  let message = 'Error interno del servidor'
  let details: unknown

  if (error instanceof ApiRequestError) {
    status = error.status
    code = error.code
    message = error.message
  } else if (error instanceof PlanError) {
    status = error.status
    code = error.code
    message = error.message
    details = error.details
  } else if (error instanceof JobError) {
    status = error.status
    code = error.code
    message = error.message
  } else if (error instanceof JellyfinError) {
    status = error.status
    code = error.status === 404 ? 'MOVIE_NOT_FOUND' : 'JELLYFIN_ERROR'
    message = error.message
  } else if (error instanceof SettingsConflictError) {
    status = 409
    code = 'SETTINGS_CONFLICT'
    message = error.message
  } else if (error instanceof SettingsValidationError) {
    status = 400
    code = 'SETTINGS_INVALID'
    message = error.message
    details = error.details
  } else if (error instanceof SyntaxError) {
    status = 400
    code = 'INVALID_JSON'
    message = 'Invalid JSON body'
  } else {
    console.error('[api]', error)
    void logEvent('error', 'api.internal', 'Internal API error')
  }

  const body: ApiErrorBody =
    details === undefined ? { error: { code, message } } : { error: { code, message, details } }
  return jsonResponse(body, status)
}

export async function readJson(
  request: Request,
  maxBytes = 64 * 1024
): Promise<Record<string, unknown>> {
  const contentType = request.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new ApiRequestError(
      'Content-Type debe ser application/json',
      415,
      'UNSUPPORTED_MEDIA_TYPE'
    )
  }
  const length = Number(request.headers.get('content-length') ?? 0)
  if (length > maxBytes)
    throw new ApiRequestError('Request body is too large', 413, 'BODY_TOO_LARGE')
  const text = await request.text()
  if (Buffer.byteLength(text, 'utf8') > maxBytes) {
    throw new ApiRequestError('Request body is too large', 413, 'BODY_TOO_LARGE')
  }
  const parsed = JSON.parse(text) as unknown
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ApiRequestError('Request body must be a JSON object', 400, 'INVALID_JSON')
  }
  return parsed as Record<string, unknown>
}

function corsOrigin(request: Request): string | null {
  const configured = getConfig().corsOrigins
  if (configured.length === 0) return null
  const origin = request.headers.get('origin')
  if (!origin) return null
  if (configured.includes('*')) return '*'
  return configured.includes(origin) ? origin : null
}

export function corsHeaders(request: Request): Headers {
  const headers = new Headers()
  const origin = corsOrigin(request)
  if (!origin) return headers
  headers.set('Access-Control-Allow-Origin', origin)
  headers.set('Vary', 'Origin')
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Range, Idempotency-Key')
  headers.set(
    'Access-Control-Expose-Headers',
    'Content-Disposition, Content-Range, Content-Length, Accept-Ranges, Retry-After'
  )
  headers.set('Access-Control-Max-Age', '600')
  return headers
}

export function applyCors(response: Response, request: Request): Response {
  const headers = corsHeaders(request)
  if (!headers.has('Access-Control-Allow-Origin')) return response
  const merged = new Headers(response.headers)
  headers.forEach((value, key) => merged.set(key, value))
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: merged,
  })
}

export function apiRoute<
  Event extends { request: Request; url: URL; params: Record<string, string> },
>(handler: (event: Event) => Promise<Response>): (event: Event) => Promise<Response> {
  return async (event: Event): Promise<Response> => {
    try {
      return await handler(event)
    } catch (error) {
      return apiError(error)
    }
  }
}
