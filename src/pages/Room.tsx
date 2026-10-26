import { useState } from 'react'
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
 * Leaving the room (control bar) or a connection error unmounts `<LiveKitRoom>`
 * — which disconnects the client — and returns to the pre-join state on the
 * same route.
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

export default function Room() {
  const { id } = useParams<{ id: string }>()

  // The route param is the single source of truth for the room to join.
  const roomName = (id ?? '').trim()

  const [connection, setConnection] = useState<Connection | null>(null)
  const [requesting, setRequesting] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  function handleDisconnected() {
    // Back to the pre-join state on the same route; the existing `error` (if
    // any) is left untouched so a connection failure stays visible.
    setConnection(null)
  }

  function handleLiveKitError(liveKitError: unknown) {
    setConnection(null)
    setError(
      liveKitError instanceof Error && liveKitError.message
        ? liveKitError.message
        : 'Could not connect to the room.',
    )
  }

  if (connection) {
    return (
      <LiveKitRoom
        token={connection.token}
        serverUrl={connection.serverUrl}
        connect
        audio
        video
        data-lk-theme="default"
        style={{ height: '100vh' }}
        onDisconnected={handleDisconnected}
        onError={handleLiveKitError}
      >
        <VideoConference />
        <RoomAudioRenderer />
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
          Join the room to start the call. Camera and microphone are enabled
          when you join; the device selection screen comes in a later step.
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
