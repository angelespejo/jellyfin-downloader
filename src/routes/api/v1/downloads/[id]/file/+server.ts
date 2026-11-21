import type { RequestHandler } from './$types'
import { apiRoute } from '#api/_shared/api.js'
import { getJobManager } from '#api/_shared/jobs.js'
import { serveFileResponse } from '#api/_shared/file-response.js'

async function serve(request: Request, id: string, head: boolean): Promise<Response> {
  const { job, path } = await getJobManager().download(id)
  return serveFileResponse({
    request,
    path,
    filename: job.outputFilename ?? 'download.bin',
    contentType: job.outputContentType,
    head,
  })
}

export const GET: RequestHandler = apiRoute(async ({ request, params }) =>
  serve(request, params.id, false)
)
export const HEAD: RequestHandler = apiRoute(async ({ request, params }) =>
  serve(request, params.id, true)
)
