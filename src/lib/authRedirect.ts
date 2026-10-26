import type { Location } from 'react-router-dom'

/**
 * Where the auth forms send the user when no destination is known.
 */
export const DEFAULT_AUTH_DESTINATION = '/dashboard'

/**
 * Shape of the router state attached by `<ProtectedRoute>` when it redirects a
 * signed-out user to `/login` (see `ProtectedRouteLocationState`).
 */
export interface AuthRedirectState {
  from?: Location | null
}

/** The pieces of a location that make up a navigable target. */
interface RedirectShape {
  pathname?: unknown
  search?: unknown
  hash?: unknown
}

/**
 * Only same-origin, absolute paths are acceptable destinations. Rejecting
 * `//host` and `/\host` keeps a crafted link from turning the redirect into an
 * open redirect to another site.
 */
function isSafeInternalPath(value: string): boolean {
  return (
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.startsWith('/\\')
  )
}

/** Read `{ pathname, search, hash }` from an unknown value, or `null`. */
function readLocationLike(value: unknown): string | null {
  if (value === null || typeof value !== 'object') {
    return null
  }

  const candidate = value as RedirectShape

  if (typeof candidate.pathname !== 'string' || !candidate.pathname.startsWith('/')) {
    return null
  }

  const search =
    typeof candidate.search === 'string' && candidate.search.startsWith('?')
      ? candidate.search
      : ''

  const hash =
    typeof candidate.hash === 'string' && candidate.hash.startsWith('#')
      ? candidate.hash
      : ''

  const target = `${candidate.pathname}${search}${hash}`

  return isSafeInternalPath(target) ? target : null
}

/**
 * Resolve where the user should land after authenticating.
 *
 * Priority:
 *  1. `state.from` — the location `<ProtectedRoute>` remembered. A refresh or
 *     a pasted /login link reproduces it; a user who followed a meeting link
 *     comes back to `/room/<id>`.
 *  2. `?redirect=` — the same target encoded in the URL, so it can travel
 *     through pages (Login ↔ Signup) and through the email-confirmation round
 *     trip, where router state is lost.
 *  3. `/dashboard` — the default for a direct visit.
 *
 * Both the state and the query value are validated as internal paths.
 */
export function readAuthRedirect(state: unknown, search: string): string {
  if (state !== null && typeof state === 'object' && 'from' in state) {
    const fromTarget = readLocationLike((state as AuthRedirectState).from)

    if (fromTarget) {
      return fromTarget
    }
  }

  const fromQuery = new URLSearchParams(search).get('redirect')

  if (fromQuery && isSafeInternalPath(fromQuery)) {
    return fromQuery
  }

  return DEFAULT_AUTH_DESTINATION
}

/**
 * Add the destination to an auth link as a query parameter, so switching
 * between Login and Signup keeps it. A default destination is omitted, so
 * plain visits still produce `/login` and `/signup`.
 */
export function withRedirectSuffix(path: string, target: string): string {
  if (!target || target === DEFAULT_AUTH_DESTINATION) {
    return path
  }

  const params = new URLSearchParams({ redirect: target })

  return `${path}?${params.toString()}`
}
