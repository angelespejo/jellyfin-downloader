import { startMockJellyfin } from '../dev/mock-jellyfin/server.ts'

startMockJellyfin().catch((error) => {
  console.error(error)
  process.exit(1)
})
