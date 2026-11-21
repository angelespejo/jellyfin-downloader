import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { contentTypeForExtension, encodeContentDisposition, parseRangeHeader } from './files.js'

export interface FileResponseInput {
  request: Request
  path: string
  filename: string
  contentType?: string | null
  head?: boolean
}

export async function serveFileResponse(input: FileResponseInput): Promise<Response> {
  let info
  try {
    info = await stat(input.path)
  } catch {
    return new Response(
      JSON.stringify({
        error: { code: 'FILE_NOT_FOUND', message: 'The file is no longer available' },
      }),
      { status: 404, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    )
  }
  if (!info.isFile()) {
    return new Response(
      JSON.stringify({ error: { code: 'FILE_NOT_FOUND', message: 'The file is invalid' } }),
      { status: 404, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    )
  }

  const extension = path.extname(input.path).replace(/^\./, '')
  const contentType = input.contentType ?? contentTypeForExtension(extension)
  const range = parseRangeHeader(input.request.headers.get('range'), info.size)
  const baseHeaders = new Headers({
    'Content-Type': contentType,
    'Content-Disposition': encodeContentDisposition(input.filename),
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
    'Content-Length': String(info.size),
  })

  if (range === 'invalid') {
    return new Response(null, {
      status: 416,
      headers: { ...Object.fromEntries(baseHeaders), 'Content-Range': `bytes */${info.size}` },
    })
  }

  if (!range) {
    if (input.head) return new Response(null, { status: 200, headers: baseHeaders })
    const stream = Readable.toWeb(createReadStream(input.path)) as ReadableStream<Uint8Array>
    return new Response(stream, { status: 200, headers: baseHeaders })
  }

  const length = range.end - range.start + 1
  const headers = new Headers(baseHeaders)
  headers.set('Content-Range', `bytes ${range.start}-${range.end}/${info.size}`)
  headers.set('Content-Length', String(length))
  if (input.head) return new Response(null, { status: 206, headers })
  const stream = Readable.toWeb(
    createReadStream(input.path, { start: range.start, end: range.end })
  ) as ReadableStream<Uint8Array>
  return new Response(stream, { status: 206, headers })
}
