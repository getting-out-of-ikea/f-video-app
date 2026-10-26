import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { User } from '@supabase/supabase-js'
import {
  LiveKitRoom,
  PreJoin,
  RoomAudioRenderer,
  VideoConference,
  useMediaDevices,
  useRoomContext,
} from '@livekit/components-react'

import '@livekit/components-styles'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

/**
 * Room page — pre-join screen + LiveKit connection (piano.md §2.3 / §2.4).
 *
 * Opening `/room/:id` shows a *pre-join* screen (`<PreJoin>`): local camera
 * preview, camera/microphone on-off toggles and device pickers, plus a speaker
 * picker. Nothing is requested from the network and no room is connected
 * during that stage — the LiveKit token is only asked for when the user
 * presses "Partecipa ora".
 *
 * The pre-join choices are then applied to `<LiveKitRoom audio video>`: the
 * selected device ids are used as capture options, and a device the user
 * turned off is passed as `false` so it is not activated on join. A device
 * that turns out to be busy/denied while joining no longer aborts the
 * connection (see `handleLiveKitError`).
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
  maxWidth: '32rem',
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

const cancelButton: CSSProperties = {
  alignSelf: 'flex-start',
  marginTop: '0.25rem',
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

/** The values the pre-join screen hands over when "Partecipa ora" is pressed. */
interface JoinChoices {
  audioEnabled: boolean
  videoEnabled: boolean
  audioDeviceId?: string
  videoDeviceId?: string
}

interface Connection {
  /** Short-lived LiveKit access token. Never displayed. */
  token: string
  serverUrl: string
  /** Capture options chosen on the pre-join screen (`false` = device off). */
  audio: { deviceId?: string } | false
  video: { deviceId?: string } | false
  /** Speaker chosen on the pre-join screen (best effort). */
  speakerDeviceId: string
}

/**
 * Read a human-readable display name from the Supabase user: explicit display
 * name first, then full name / name, and finally the email local-part.
 */
function readDisplayName(user: User | null): string {
  const metadata: Record<string, unknown> = user?.user_metadata ?? {}

  for (const key of ['display_name', 'full_name', 'name']) {
    const value = metadata[key]

    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }

  const email = user?.email?.trim() ?? ''

  return email ? email.split('@')[0] : 'Ospite'
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

/**
 * Applies the speaker selected on the pre-join screen once the room exists.
 * Switching the audio output device is best effort: not every browser supports
 * `setSinkId`, so failures are ignored.
 */
function SpeakerSwitch({ deviceId }: { deviceId: string }) {
  const room = useRoomContext()

  useEffect(() => {
    if (!deviceId) {
      return
    }

    void room.switchActiveDevice('audiooutput', deviceId).catch(() => {
      // Ignored: output selection is a nice-to-have.
    })
  }, [room, deviceId])

  return null
}

export default function Room() {
  const { id } = useParams<{ id: string }>()

  // The route param is the single source of truth for the room to join.
  const roomName = (id ?? '').trim()

  const navigate = useNavigate()
  const { user } = useAuth()
  const displayName = readDisplayName(user)

  // Speaker picker for the pre-join screen. Camera and microphone devices are
  // chosen with the selectors built into <PreJoin>.
  const speakerDevices = useMediaDevices({ kind: 'audiooutput' })
  const [speakerDeviceId, setSpeakerDeviceId] = useState('')

  const [previewError, setPreviewError] = useState<string | null>(null)
  const [connection, setConnection] = useState<Connection | null>(null)
  const [requesting, setRequesting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Kept in a ref (not state) so the `onError` / `onDisconnected` handlers
  // always read the current value, even if LiveKit captured them earlier.
  // `true` once the room is actually connected.
  const joinedRef = useRef(false)

  /**
   * Runs only when the user presses "Partecipa ora" on the pre-join screen:
   * asks the Edge Function for a token and mounts `<LiveKitRoom>` with the
   * device choices made on that screen.
   */
  async function handleJoin(choices: JoinChoices) {
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
    setPreviewError(null)
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

      // Rendering `<LiveKitRoom connect>` is what actually connects. Devices
      // the user disabled are passed as `false`, so they are not requested.
      joinedRef.current = false
      setConnection({
        token,
        serverUrl: liveKitServerUrl,
        audio: choices.audioEnabled
          ? { deviceId: choices.audioDeviceId || undefined }
          : false,
        video: choices.videoEnabled
          ? { deviceId: choices.videoDeviceId || undefined }
          : false,
        speakerDeviceId,
      })
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
        // Devices chosen on the pre-join screen; `false` keeps a device off.
        audio={connection.audio}
        video={connection.video}
        data-lk-theme="default"
        style={{ height: '100vh' }}
        onConnected={handleConnected}
        onDisconnected={handleDisconnected}
        onError={handleLiveKitError}
      >
        <VideoConference />
        <RoomAudioRenderer />
        <SpeakerSwitch deviceId={connection.speakerDeviceId} />

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
          Signed in as <strong>{displayName}</strong>
        </p>

        {requesting ? (
          <p role="status" style={muted}>
            Joining the room…
          </p>
        ) : (
          <>
            <p style={muted}>
              Check your camera and microphone, then join. Nothing is sent until
              you press “Partecipa ora”.
            </p>

            <PreJoin
              defaults={{
                username: displayName,
                videoEnabled: true,
                audioEnabled: true,
              }}
              joinLabel="Partecipa ora"
              userLabel="Nome"
              camLabel="Fotocamera"
              micLabel="Microfono"
              onSubmit={(values) => {
                void handleJoin(values)
              }}
              onError={(caught) => {
                // Device busy / permission denied in the preview: the user can
                // still turn the device off below and join.
                setPreviewError(describeLiveKitError(caught))
              }}
            />

            {speakerDevices.length > 0 && (
              <label style={muted}>
                Altoparlante
                <select
                  value={speakerDeviceId}
                  onChange={(event) => setSpeakerDeviceId(event.target.value)}
                  style={{ display: 'block', width: '100%', marginTop: '0.25rem' }}
                >
                  <option value="">Predefinito</option>
                  {speakerDevices.map((device, index) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label || `Altoparlante ${index + 1}`}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </>
        )}

        {previewError && (
          <p role="alert" style={errorText}>
            {previewError} You can turn the device off and still join.
          </p>
        )}

        {error && (
          <p role="alert" style={errorText}>
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={() => navigate('/dashboard')}
          style={cancelButton}
        >
          Cancel
        </button>
      </div>
    </main>
  )
}
