import { useCallback, useState } from 'react'

import { supabase } from '../lib/supabase'

/**
 * `useLiveKitToken()` — requests a LiveKit access token for one room
 * (piano.md §2.5).
 *
 * The request is always explicit: nothing happens on mount or in an effect, a
 * token is only asked for when the caller invokes `requestToken()` (in this app
 * that is the "Partecipa ora" handler on the pre-join screen). This keeps the
 * pre-join screen completely offline and guarantees one token per join.
 *
 * The Edge Function call itself is unchanged from the previous implementation:
 * `supabase.functions.invoke('livekit-token', { body: { roomName } })` attaches
 * the access token of the current Supabase session automatically, so the
 * function sees the signed-in user. The LiveKit API key/secret stay in the
 * Edge Function and are never part of the frontend.
 *
 * The token lives in component state only: it is never rendered, never logged
 * and never included in an error message.
 */

// Same defensive read as `src/lib/supabase.ts`: a missing variable is `''`,
// and values are never echoed into the UI or the console.
const env = import.meta.env as unknown as Record<string, string | undefined>

const liveKitServerUrl =
  typeof env.VITE_LIVEKIT_URL === 'string' ? env.VITE_LIVEKIT_URL.trim() : ''

/** What a successful token request yields: everything `<LiveKitRoom>` needs. */
export interface LiveKitConnectionDetails {
  /** Short-lived LiveKit access token. Never displayed. */
  token: string
  /** LiveKit server URL (`VITE_LIVEKIT_URL`). */
  serverUrl: string
}

export interface UseLiveKitTokenResult {
  /** LiveKit server URL from the environment (`''` when not configured). */
  serverUrl: string
  /** Token of the last successful request, `null` before that / after `reset`. */
  token: string | null
  /** `true` while a token request is in flight. */
  loading: boolean
  /** Human-readable message of the last failed request, else `null`. */
  error: string | null
  /** Explicitly requests a token for the room. Resolves to `null` on failure. */
  requestToken: () => Promise<LiveKitConnectionDetails | null>
  /** Forgets the current token/error (e.g. when the call is left). */
  reset: () => void
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

export function useLiveKitToken(roomId: string): UseLiveKitTokenResult {
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const trimmedRoomId = roomId.trim()

  const requestToken = useCallback(async (): Promise<LiveKitConnectionDetails | null> => {
    if (!trimmedRoomId) {
      setError('The room id is missing from the URL.')
      return null
    }

    if (!liveKitServerUrl) {
      setError(
        'VITE_LIVEKIT_URL is not configured. Add it to `.env.local` and restart the dev server.',
      )
      return null
    }

    setError(null)
    setLoading(true)

    try {
      // `invoke` attaches the access token of the current Supabase session
      // automatically, so the Edge Function sees the signed-in user.
      const { data, error: invokeError } = await supabase.functions.invoke(
        'livekit-token',
        { body: { roomName: trimmedRoomId } },
      )

      if (invokeError) {
        setError(await describeFunctionError(invokeError))
        return null
      }

      const receivedToken = readToken(data)

      if (!receivedToken) {
        setError('The token endpoint responded without a token.')
        return null
      }

      setToken(receivedToken)

      return { token: receivedToken, serverUrl: liveKitServerUrl }
    } catch (caught) {
      // Network failures / CORS problems land here.
      setError(
        caught instanceof Error && caught.message
          ? caught.message
          : 'Could not reach the token endpoint.',
      )
      return null
    } finally {
      setLoading(false)
    }
  }, [trimmedRoomId])

  const reset = useCallback(() => {
    setToken(null)
    setError(null)
  }, [])

  return { serverUrl: liveKitServerUrl, token, loading, error, requestToken, reset }
}
