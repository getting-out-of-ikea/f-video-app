/* eslint-disable react-refresh/only-export-components -- this module exports
   the provider component together with the `useAuth` hook on purpose, so that
   the context object itself stays private to this file. */
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

/**
 * Auth state shared by the whole application — implementation of
 * "1.4 Auth state management" (piano.md).
 *
 * Scope of this step: hydrate the current session, subscribe to
 * `onAuthStateChange`, and expose the `useAuth()` hook. The
 * `signIn`/`signUp`/`signOut` helpers, the dashboard and the route guards are
 * intentionally not part of it; the pages keep calling `supabase.auth`
 * directly for now.
 */

export interface AuthContextValue {
  /** Supabase user of the current session, or `null` when signed out. */
  user: User | null
  /** Raw Supabase session (holds the tokens), or `null` when signed out. */
  session: Session | null
  /** `true` until the initial session retrieval has completed. */
  loading: boolean
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  // `user` is derived from the session rather than stored separately, so the
  // two can never drift apart.
  const user = useMemo(() => session?.user ?? null, [session])

  useEffect(() => {
    // Ignore state updates after unmount. This also covers React StrictMode,
    // which runs the effect twice in development.
    let cancelled = false

    // 1) Hydrate the initial state from the persisted session. `getSession()`
    //    also refreshes an expired access token before resolving.
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (cancelled) return
        setSession(data.session)
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        // An unusable persisted session is the same as being signed out: fall
        // through instead of leaving the app stuck in its loading state.
        setSession(null)
        setLoading(false)
      })

    // 2) Keep the state in sync with sign-in, sign-out, token refresh and
    //    changes made in another tab. Only plain state updates are performed
    //    in this callback: awaiting other `supabase.auth` methods here can
    //    deadlock the GoTrue client.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (cancelled) return
      setSession(nextSession)
      setLoading(false)
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ user, session, loading }),
    [user, session, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/**
 * Access the auth state. Throws when used outside `<AuthProvider>`, so a
 * missing provider fails loudly instead of silently reporting a signed-out
 * user for a signed-in session.
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)

  if (context === undefined) {
    throw new Error('useAuth() must be used within an <AuthProvider>.')
  }

  return context
}
