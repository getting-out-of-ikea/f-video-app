import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

/**
 * Route guard — implementation of the protected-route part of
 * "1.6 Route protection" (piano.md).
 *
 * Renders `children` only for a signed-in user. Two other outcomes:
 *
 *   - auth still initialising -> a short loading message (no redirect, so a
 *     page refresh on a protected URL does not bounce a signed-in user to
 *     `/login`);
 *   - signed out -> `<Navigate>` to `/login`, carrying the requested URL in
 *     router state so a later step can return the user there after login.
 *
 * `PublicOnlyRoute` (the reverse guard for `/login` and `/signup`), the
 * dashboard page and the route wiring are not part of this step.
 */

/** Shape of the router state attached to the `/login` redirect. */
export interface ProtectedRouteLocationState {
  /** The protected location the user tried to open. */
  from: ReturnType<typeof useLocation>
}

export interface ProtectedRouteProps {
  children: ReactNode
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <main
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.5rem',
        }}
        aria-busy="true"
        aria-live="polite"
      >
        <p>Checking your session…</p>
      </main>
    )
  }

  if (!user) {
    // `replace` keeps the guarded URL out of the history stack, so Back from
    // the login screen does not bounce through the guard again.
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location } satisfies ProtectedRouteLocationState}
      />
    )
  }

  return <>{children}</>
}

export default ProtectedRoute
