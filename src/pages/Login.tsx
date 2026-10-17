import { useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const page: CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '1.5rem',
}

const card: CSSProperties = {
  width: '100%',
  maxWidth: '22rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.75rem',
}

const field: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.25rem',
}

const errorText: CSSProperties = {
  color: '#b00020',
}

const muted: CSSProperties = {
  color: '#555',
  fontSize: '0.875rem',
}

/**
 * Login page (piano.md §1.5, "Login page"), without the password-reset link,
 * which is not part of this step.
 *
 * On success the page only reports which account is signed in. Redirecting to
 * a dashboard needs the session-aware routing of §1.4 / §1.6.
 */
export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSignedInEmail(null)

    const trimmedEmail = email.trim()
    setLoading(true)

    try {
      const { data, error: signInError } =
        await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password,
        })

      if (signInError) {
        // The usual dead end for a brand-new account is an unconfirmed email,
        // which Supabase reports as generic invalid credentials.
        setError(
          signInError.message === 'Invalid login credentials'
            ? 'Wrong email or password. If you just signed up, confirm your email address first.'
            : signInError.message,
        )
        return
      }

      setSignedInEmail(data.user?.email ?? trimmedEmail)
      setPassword('')
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unexpected error. Please try again.',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <main style={page}>
      <form style={card} onSubmit={handleSubmit} noValidate>
        <h1>Log in</h1>

        <label style={field}>
          <span>Email</span>
          <input
            type="email"
            name="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={loading}
          />
        </label>

        <label style={field}>
          <span>Password</span>
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={loading}
          />
        </label>

        {error && (
          <p style={errorText} role="alert">
            {error}
          </p>
        )}

        {signedInEmail && (
          <p role="status">
            Logged in as <strong>{signedInEmail}</strong>. The dashboard and
            protected routes are added in a later step.
          </p>
        )}

        <button type="submit" disabled={loading}>
          {loading ? 'Logging in…' : 'Log in'}
        </button>

        <p style={muted}>
          No account yet? <Link to="/signup">Sign up</Link>
        </p>
      </form>
    </main>
  )
}
