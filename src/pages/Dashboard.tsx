import { useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

/**
 * Dashboard page (piano.md §1.5 and §2.6).
 *
 * Shows the signed-in user's email, a sign-out button and the two room entry
 * points of §2.6:
 *
 *  - "Nuova riunione" generates a random room id and opens its pre-join screen;
 *  - "Partecipa" accepts a room id or a pasted meeting link and opens the
 *    matching room.
 *
 * The dashboard only ever changes the URL (`navigate('/room/<id>')`): it does
 * not import LiveKit, request a token or connect to a room. The actual join
 * still happens on the pre-join screen via "Partecipa ora" (§2.3, §2.5, §2.6).
 */

/**
 * Room ids that are safe to put in a URL path: a leading letter/digit followed
 * by up to 127 letters, digits, ".", "_" or "-". `crypto.randomUUID()` output
 * matches this pattern.
 */
const ROOM_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/

const INVALID_ROOM_INPUT =
  'Enter a room id (letters, digits, "-", "_" or ".") or paste a meeting link that contains /room/<id>.'

/**
 * Accept either a bare room id ("abc-123") or a meeting link
 * ("https://host/room/abc-123", "/room/abc-123") and return the room id.
 * Returns `null` when the input is empty or does not contain a valid room id.
 */
function extractRoomId(rawInput: string): string | null {
  const input = rawInput.trim()

  if (!input) {
    return null
  }

  // 1) The user typed a room id directly.
  if (ROOM_ID_PATTERN.test(input)) {
    return input
  }

  // 2) The user pasted a link: read the path and take the segment after "room".
  //    A relative path ("/room/abc") is resolved against the current origin.
  let pathname: string

  try {
    pathname = new URL(input, window.location.origin).pathname
  } catch {
    return null
  }

  const segments = pathname.split('/').filter(Boolean)
  const roomIndex = segments
    .map((segment) => segment.toLowerCase())
    .lastIndexOf('room')

  if (roomIndex === -1 || roomIndex === segments.length - 1) {
    return null
  }

  let candidate: string

  try {
    candidate = decodeURIComponent(segments[roomIndex + 1])
  } catch {
    return null
  }

  return ROOM_ID_PATTERN.test(candidate) ? candidate : null
}

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

const section: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
  paddingTop: '0.75rem',
  borderTop: '1px solid #e5e7eb',
}

const heading: CSSProperties = {
  fontSize: '1rem',
  margin: 0,
}

const form: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
}

const textInput: CSSProperties = {
  padding: '0.5rem',
  border: '1px solid #d1d5db',
  borderRadius: '0.375rem',
  font: 'inherit',
}

const alignStart: CSSProperties = {
  alignSelf: 'flex-start',
}

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()

  // "Partecipa" form state.
  const [joinInput, setJoinInput] = useState('')
  const [joinError, setJoinError] = useState<string | null>(null)

  // Sign-out state.
  const [signingOut, setSigningOut] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * "Nuova riunione": mint a random room id and open its pre-join screen. Only
   * the URL changes — the join itself happens later, from the Room page.
   */
  function handleStartMeeting() {
    navigate(`/room/${crypto.randomUUID()}`)
  }

  /**
   * "Partecipa": read the room id from the input (or from a pasted link) and
   * open it. Again only the URL changes; invalid input stays on the dashboard.
   */
  function handleJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setJoinError(null)

    const roomId = extractRoomId(joinInput)

    if (!roomId) {
      setJoinError(INVALID_ROOM_INPUT)
      return
    }

    navigate(`/room/${encodeURIComponent(roomId)}`)
  }

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

        <section style={section}>
          <h2 style={heading}>Nuova riunione</h2>

          <p style={muted}>
            Create a room with a random id and open its pre-join screen.
          </p>

          <button type="button" onClick={handleStartMeeting} style={alignStart}>
            Nuova riunione
          </button>
        </section>

        <section style={section}>
          <h2 style={heading}>Partecipa</h2>

          <form onSubmit={handleJoin} style={form}>
            <label htmlFor="room-input" style={muted}>
              Room id or meeting link
            </label>

            <input
              id="room-input"
              type="text"
              value={joinInput}
              onChange={(event) => {
                setJoinInput(event.target.value)

                // Clear the message as soon as the user edits the input.
                if (joinError) {
                  setJoinError(null)
                }
              }}
              placeholder="abc-123 or https://…/room/abc-123"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={joinError ? 'true' : undefined}
              aria-describedby={joinError ? 'room-input-error' : undefined}
              style={textInput}
            />

            <button type="submit" style={alignStart}>
              Partecipa
            </button>
          </form>

          {joinError && (
            <p id="room-input-error" role="alert" style={errorText}>
              {joinError}
            </p>
          )}
        </section>

        {error && (
          <p style={errorText} role="alert">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={handleSignOut}
          disabled={signingOut}
          style={alignStart}
        >
          {signingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </main>
  )
}
