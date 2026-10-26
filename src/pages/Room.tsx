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
import { useLiveKitToken } from '../hooks/useLiveKitToken'

/**
 * Room page — pre-join screen + LiveKit connection (piano.md §2.3 / §2.4 /
 * §2.5 / §2.7).
 *
 * Opening `/room/:id` shows a *pre-join* screen (`<PreJoin>`): local camera
 * preview, camera/microphone on-off toggles and device pickers, plus a speaker
 * picker. Nothing is requested from the network and no room is connected
 * during that stage — `useLiveKitToken().requestToken()` is only called when
 * the user presses "Partecipa ora".
 *
 * The pre-join choices are then applied to `<LiveKitRoom audio video>`: the
 * selected device ids are used as capture options, and a device the user
 * turned off is passed as `false` so it is not activated on join. A device
 * that turns out to be busy/denied while joining no longer aborts the
 * connection (see `handleLiveKitError`).
 *
 * Camera/microphone failures on the pre-join screen are translated into
 * friendly, actionable messages (§2.7 requirement 2): the user stays on the
 * pre-join screen, can retry by toggling the device (see `<PreJoin>`) and can
 * always join with the failing device switched off.
 *
 * Leaving the room (control bar "Leave", or a remote end) navigates back to the
 * dashboard; a *failed* connection instead returns to the pre-join state on the
 * same route so the error stays visible. Errors that happen *after* the room is
 * connected (typically media/device errors) are only reported and keep the
 * call alive.
 */

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

/** Device selection to hand to `<LiveKitRoom>` once a token is available. */
interface JoinSettings {
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

function describeLiveKitError(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : 'Could not connect to the room.'
}

/**
 * The kinds of camera/microphone failure the pre-join screen can explain
 * (piano.md §2.7 requirement 2).
 */
type MediaIssueKind = 'permission-denied' | 'device-not-found' | 'device-busy' | 'unknown'

/**
 * Error names that map to each kind. Browsers report media failures through
 * `DOMException` names; LiveKit may wrap the original error and expose its own
 * `MediaDeviceFailure` values ("PermissionDenied", "NotFound", "DeviceInUse").
 * Both spellings are listed so the classification works either way.
 */
const MEDIA_ISSUE_HINTS: Record<Exclude<MediaIssueKind, 'unknown'>, string[]> = {
  'permission-denied': [
    'NotAllowedError',
    'PermissionDeniedError',
    'SecurityError',
    'PermissionDenied',
  ],
  'device-not-found': [
    'NotFoundError',
    'DevicesNotFoundError',
    'OverconstrainedError',
    'NotFound',
  ],
  'device-busy': ['NotReadableError', 'TrackStartError', 'AbortError', 'DeviceInUse'],
}

/**
 * Friendly, actionable message per failure kind. Every message ends with the
 * two things the user can do on this screen: retry by toggling the device, or
 * join without it.
 */
const MEDIA_ISSUE_MESSAGES: Record<Exclude<MediaIssueKind, 'unknown'>, string> = {
  'permission-denied':
    'Camera or microphone access is blocked. Allow it for this site in your browser (padlock icon in the address bar → Site settings), then switch the device off and on again on this screen to retry. You can also join with it switched off.',
  'device-not-found':
    'No camera or microphone was found. Connect one, or enable it in your system settings, then switch the device off and on again on this screen to retry. You can also join with it switched off.',
  'device-busy':
    'Your camera or microphone looks busy: another application or browser tab may be using it. Close it, then switch the device off and on again on this screen to retry. You can also join with it switched off.',
}

/** Classify a media error reported by `<PreJoin>`. */
function classifyMediaError(error: unknown): MediaIssueKind {
  const candidate = (error ?? null) as { name?: unknown; failure?: unknown } | null

  const hints: string[] = []

  if (candidate) {
    for (const value of [candidate.name, candidate.failure]) {
      if (typeof value === 'string' && value.trim()) {
        hints.push(value.trim().toLowerCase())
      }
    }
  }

  for (const [kind, names] of Object.entries(MEDIA_ISSUE_HINTS) as Array<
    [Exclude<MediaIssueKind, 'unknown'>, string[]]
  >) {
    if (names.some((name) => hints.includes(name.toLowerCase()))) {
      return kind
    }
  }

  return 'unknown'
}

/**
 * Turn a pre-join media error into a message that explains the cause and what
 * the user can do about it. Unknown errors keep the original message and get
 * the same retry/join-without-it guidance appended.
 */
function describeMediaError(error: unknown): string {
  const kind = classifyMediaError(error)

  if (kind !== 'unknown') {
    return MEDIA_ISSUE_MESSAGES[kind]
  }

  return `${describeLiveKitError(error)} Check the device and your browser permissions, then switch the device off and on again on this screen to retry. You can also join with it switched off.`
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

  // Token request (Edge Function) + server URL. Nothing is requested until
  // `requestToken()` is called from `handleJoin`.
  const {
    serverUrl,
    token,
    loading,
    error: tokenError,
    requestToken,
    reset: resetToken,
  } = useLiveKitToken(roomName)

  // Speaker picker for the pre-join screen. Camera and microphone devices are
  // chosen with the selectors built into <PreJoin>.
  const speakerDevices = useMediaDevices({ kind: 'audiooutput' })
  const [speakerDeviceId, setSpeakerDeviceId] = useState('')

  const [previewError, setPreviewError] = useState<string | null>(null)
  const [settings, setSettings] = useState<JoinSettings | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Kept in a ref (not state) so the `onError` / `onDisconnected` handlers
  // always read the current value, even if LiveKit captured them earlier.
  // `true` once the room is actually connected.
  const joinedRef = useRef(false)

  /**
   * Runs only when the user presses "Partecipa ora" on the pre-join screen:
   * asks the hook for a token and remembers the device choices, which mounts
   * `<LiveKitRoom>` with those choices.
   */
  async function handleJoin(choices: JoinChoices) {
    setError(null)
    setPreviewError(null)

    // Failure is reported through the hook's `error` state; stay on pre-join.
    const details = await requestToken()

    if (!details) {
      return
    }

    // Devices the user disabled are passed as `false`, so they are not
    // requested when the room connects.
    joinedRef.current = false
    setSettings({
      audio: choices.audioEnabled
        ? { deviceId: choices.audioDeviceId || undefined }
        : false,
      video: choices.videoEnabled
        ? { deviceId: choices.videoDeviceId || undefined }
        : false,
      speakerDeviceId,
    })
  }

  function handleConnected() {
    joinedRef.current = true
  }

  function handleDisconnected() {
    // Read before clearing: `onDisconnected` also fires when a *failed*
    // connection unmounts the room, and then we must not navigate away.
    const wasJoined = joinedRef.current

    joinedRef.current = false
    setSettings(null)
    resetToken()

    if (wasJoined) {
      // Left the call (control bar "Leave" or remote end): back to dashboard.
      navigate('/dashboard')
    }
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
    setSettings(null)
    resetToken()
    setError(message)
  }

  if (settings && token) {
    return (
      <LiveKitRoom
        token={token}
        serverUrl={serverUrl}
        connect
        // Devices chosen on the pre-join screen; `false` keeps a device off.
        audio={settings.audio}
        video={settings.video}
        data-lk-theme="default"
        style={{ height: '100vh' }}
        onConnected={handleConnected}
        onDisconnected={handleDisconnected}
        onError={handleLiveKitError}
      >
        <VideoConference />
        <RoomAudioRenderer />
        <SpeakerSwitch deviceId={settings.speakerDeviceId} />

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

        {loading ? (
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
                // Permission denied / no device / device busy: explain the
                // cause and how to retry. The user stays on this screen and can
                // also join with the failing device switched off.
                setPreviewError(describeMediaError(caught))
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
            {previewError}
          </p>
        )}

        {(tokenError ?? error) && (
          <p role="alert" style={errorText}>
            {tokenError ?? error}
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
