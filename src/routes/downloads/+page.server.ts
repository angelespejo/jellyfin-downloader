import type { PageServerLoad } from './$types'
import { getLocalDownloadsStore } from '#api/_shared/local-downloads.js'
import type { LocalDownloadInfo } from '#lib/types.js'

export const load: PageServerLoad = async () => {
  const store = getLocalDownloadsStore()
  let items: LocalDownloadInfo[] = []
  let warning = false
  try {
    items = await store.list()
  } catch {
    warning = true
  }
  return { items, warning }
}
