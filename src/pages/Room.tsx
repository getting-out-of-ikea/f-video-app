import { useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  LiveKitRoom,
  RoomAudioRenderer,
  VideoConference,
} from '@livekit/components-react'

import '@livekit/components-styles'
import { supabase } from '../lib/supabase'

/**
 * Room page — first real LiveKit connection (piano.md §2.3, step 2.3).
 *
 * Joining is always explicit: loading the page requests nothing and connects
 * nothing. Clicking "Partecipa" asks the `livekit-token` Edge Function for a
 * token for the room id taken from the URL (`/room/:id`); only after a token
 * has been received is `<LiveKitRoom connect>` mounted, using
 * `VITE_LIVEKIT_URL` as the server URL.
 *
 * Camera and microphone are *not* requested on join (`audio`/`video` are
 * `false`): the user connects to the room first and then enables the devices
 * from the LiveKit control bar. A device that is busy or whose permission is
 * denied therefore never kicks the user out of the room.
 *
 * Leaving the room (control bar) or a failed connection unmounts
 * `<LiveKitRoom>` — which disconnects the client — and returns to the pre-join
 * state on the same route. Errors that happen *after* the room is connected
 * (typically media/device errors) are only reported and keep the call alive.
 *
 * The token lives in component state only: it is never rendered, never logged
 * and never included in an error message. The LiveKit API key/secret stay in
 * the Edge Function and are not part of the frontend.
 */

// Same defensive read as `src/lib/supabase.ts`: a missing variable is `''`,
// and values are never echoed into the UI or the console.
const env = import.meta.env as unknown as Record<string, string | undefined>

const liveKitServerUrl =
  typeof env.VITE_LIVEKIT_URL === 'string' ? env.VITE_LIVEKIT_URL.trim() : ''

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

const muted: CSSProperties = {
  color: '#555',
  fontSize: '0.875rem',
}

const errorText: CSSProperties = {
  color: '#b91c1c',
  fontSize: '0.875rem',
}

/**
 * In-room error banner: shown on top of the call, so a failed device
 * activation is visible without disconnecting the user.
 */
const roomErrorBanner: CSSProperties = {
  position: 'fixed',
  bottom: '6rem',
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 10,
  maxWidth: '32rem',
  margin: 0,
  padding: '0.5rem 0.75rem',
  borderRadius: '0.375rem',
  background: '#fee2e2',
  color: '#b91c1c',
  fontSize: '0.875rem',
}

interface Connection {
  /** Short-lived LiveKit access token. Never displayed. */
  token: string
  serverUrl: string
}

/**
 * Extract the token from the Edge Function response without ever surfacing the
 * value. Anything unexpected is reported as "no token".
 */
function readToken(data: unknown): string {
  if (data === null || typeof data !== 'object') {
    return ''
  }

  const token = (data as { token?: unknown }).token

  return typeof token === 'string' ? token.trim() : ''
}

/**
 * Turn the error thrown by `functions.invoke` into a short, human-readable
 * message. For non-2xx responses the Supabase client throws a
 * `FunctionsHttpError` whose `context` is the raw `Response`; only the HTTP
 * status and the JSON `error` field sent by the Edge Function are read.
 * Nothing from the request/response headers, the token or env is included.
 */
async function describeFunctionError(error: unknown): Promise<string> {
  const fallback =
    error instanceof Error && error.message
      ? error.message
      : 'Unknown error while calling the function.'

  const context = (error as { context?: unknown }).context

  if (!(context instanceof Response)) {
    return fallback
  }

  const status = `${context.status}${context.statusText ? ` ${context.statusText}` : ''}`

  try {
    // `clone()` keeps the original response body untouched.
    const body = await context.clone().text()

    if (body) {
      try {
        const parsed: unknown = JSON.parse(body)

        if (
          parsed !== null &&
          typeof parsed === 'object' &&
          'error' in parsed &&
          typeof (parsed as { error?: unknown }).error === 'string'
        ) {
          return `${(parsed as { error: string }).error} (HTTP ${status})`
        }
      } catch {
        // Not JSON — fall through to the plain status message.
      }
    }
  } catch {
    // Body could not be read — fall through to the plain status message.
  }

  return `Request failed with HTTP ${status}.`
}

function describeLiveKitError(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : 'Could not connect to the room.'
}

export default function Room() {
  const { id } = useParams<{ id: string }>()

  // The route param is the single source of truth for the room to join.
  const roomName = (id ?? '').trim()

  const [connection, setConnection] = useState<Connection | null>(null)
  const [requesting, setRequesting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Kept in a ref (not state) so the `onError` / `onDisconnected` handlers
  // always read the current value, even if LiveKit captured them earlier.
  // `true` once the room is actually connected.
  const joinedRef = useRef(false)

  async function handleJoin() {
    if (!roomName) {
      setError('The room id is missing from the URL.')
      return
    }

    if (!liveKitServerUrl) {
      setError(
        'VITE_LIVEKIT_URL is not configured. Add it to `.env.local` and restart the dev server.',
      )
      return
    }

    setError(null)
    setRequesting(true)

    try {
      // `invoke` attaches the access token of the current Supabase session
      // automatically, so the Edge Function sees the signed-in user.
      const { data, error: invokeError } = await supabase.functions.invoke(
        'livekit-token',
        { body: { roomName } },
      )

      if (invokeError) {
        setError(await describeFunctionError(invokeError))
        return
      }

      const token = readToken(data)

      if (!token) {
        setError('The token endpoint responded without a token.')
        return
      }

      // Rendering `<LiveKitRoom connect>` is what actually connects.
      joinedRef.current = false
      setConnection({ token, serverUrl: liveKitServerUrl })
    } catch (caught) {
      // Network failures / CORS problems land here.
      setError(
        caught instanceof Error && caught.message
          ? caught.message
          : 'Could not reach the token endpoint.',
      )
    } finally {
      setRequesting(false)
    }
  }

  function handleConnected() {
    joinedRef.current = true
  }

  function handleDisconnected() {
    // Back to the pre-join state on the same route; the existing `error` (if
    // any) is left untouched so a connection failure stays visible.
    joinedRef.current = false
    setConnection(null)
  }

  function handleLiveKitError(liveKitError: unknown) {
    const message = describeLiveKitError(liveKitError)

    if (joinedRef.current) {
      // Media/device error (camera busy, permission denied, publish failure)
      // after the room was joined: report it, but stay in the call. The user
      // can retry from the control bar.
      setError(message)
      return
    }

    // The connection itself failed — go back to the pre-join state.
    joinedRef.current = false
    setConnection(null)
    setError(message)
  }

  if (connection) {
    return (
      <LiveKitRoom
        token={connection.token}
        serverUrl={connection.serverUrl}
        connect
        // Do not request camera/microphone while joining: the devices are
        // enabled on demand from the control bar, so a busy or denied device
        // can never abort the connection.
        audio={false}
        video={false}
        data-lk-theme="default"
        style={{ height: '100vh' }}
        onConnected={handleConnected}
        onDisconnected={handleDisconnected}
        onError={handleLiveKitError}
      >
        <VideoConference />
        <RoomAudioRenderer />

        {error && (
          <p role="alert" style={roomErrorBanner}>
            {error}
          </p>
        )}
      </LiveKitRoom>
    )
  }

  return (
    <main style={page}>
      <div style={card}>
        <h1>Room</h1>

        <p>
          Room id: <strong>{roomName || '(none)'}</strong>
        </p>

        <p style={muted}>
          Join the room to start the call. Camera and microphone stay off until
          you turn them on from the control bar.
        </p>

        <button
          type="button"
          onClick={handleJoin}
          disabled={requesting || !roomName || !liveKitServerUrl}
          style={{ alignSelf: 'flex-start' }}
        >
          {requesting ? 'Connecting…' : 'Partecipa'}
        </button>

        {requesting && (
          <p role="status" style={muted}>
            Requesting a room token…
          </p>
        )}

        {error && (
          <p role="alert" style={errorText}>
            {error}
          </p>
        )}

        <p>
          <Link to="/dashboard">Back to dashboard</Link>
        </p>
      </div>
    </main>
  )
}
