/**
 * Jellyfin users are required for item detail queries on Jellyfin 12+, where
 * `GET /Items/{id}` returns HTTP 400 unless a `userId` is provided.
 */
export interface JellyfinUser {
  Id?: string
  Name?: string
  Policy?: {
    IsAdministrator?: boolean
    IsDisabled?: boolean
  }
}

/**
 * Picks the user used for API key requests: an enabled administrator when
 * available, otherwise the first enabled user.
 */
export function pickJellyfinUser(users: readonly JellyfinUser[]): string | null {
  const enabled = users.filter(
    (user) => typeof user.Id === 'string' && user.Id.length > 0 && user.Policy?.IsDisabled !== true
  )
  const administrator = enabled.find((user) => user.Policy?.IsAdministrator === true)
  return (administrator ?? enabled[0])?.Id ?? null
}
