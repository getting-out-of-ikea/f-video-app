import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

/**
 * Dashboard page (piano.md §1.5, "Dashboard page"), minimal version.
 *
 * Shows the signed-in user's email, a sign-out button and a link to a sample
 * room. The room list / "Partecipa" form of §2.3 and the whole video flow are
 * Phase 2 and are not implemented here.
 */

/** Fixed room id used by the sample link until rooms are listed (§2.6). */
const SAMPLE_ROOM_ID = 'sample-room'

const page: CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '1.5rem',
}

const card: CSSProperties = {
  width: '100%',
  maxWidth: '28rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.75rem',
}

const errorText: CSSProperties = {
  color: '#b00020',
}

const muted: CSSProperties = {
  color: '#555',
  fontSize: '0.875rem',
}

export default function Dashboard() {
  const { user } = useAuth()
  const [signingOut, setSigningOut] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSignOut() {
    setError(null)
    setSigningOut(true)

    try {
      const { error: signOutError } = await supabase.auth.signOut()

      if (signOutError) {
        setError(signOutError.message)
        return
      }

      // No navigation needed: signing out clears the session in AuthContext,
      // ProtectedRoute then sees `user === null` and redirects to /login.
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unexpected error. Please try again.',
      )
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <main style={page}>
      <div style={card}>
        <h1>Dashboard</h1>

        <p>
          Signed in as <strong>{user?.email ?? 'unknown user'}</strong>.
        </p>

        <p>
          <Link to={`/room/${SAMPLE_ROOM_ID}`}>Open a sample room</Link>{' '}
          <span style={muted}>(/room/{SAMPLE_ROOM_ID})</span>
        </p>

        <p style={muted}>
          Video calling is not wired up yet: the room page is a placeholder for
          the LiveKit steps.
        </p>

        {error && (
          <p style={errorText} role="alert">
            {error}
          </p>
        )}

        <button type="button" onClick={handleSignOut} disabled={signingOut}>
          {signingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </main>
  )
}
