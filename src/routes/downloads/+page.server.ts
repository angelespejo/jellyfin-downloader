import type { PageServerLoad } from './$types'
import { getLocalDownloadsStore } from '#api/_shared/local-downloads.js'
import type { LocalDownloadInfo } from '#lib/types.js'
import { PAGE_SIZE } from '#const'

export const load: PageServerLoad = async () => {
  const store = getLocalDownloadsStore()
  let page: {
    items: LocalDownloadInfo[]
    total: number
    usedBytes: number
    objects: number
  } = { items: [], total: 0, usedBytes: 0, objects: 0 }
  let warning = false
  try {
    page = await store.listPage({ limit: PAGE_SIZE })
  } catch {
    warning = true
  }
  return { ...page, limit: PAGE_SIZE, offset: 0, warning }
}
