export class JellyfinError extends Error {
  readonly status: number

  constructor(message: string, status = 502) {
    super(message)
    this.name = 'JellyfinError'
    this.status = status
  }
}
