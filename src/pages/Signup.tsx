import { useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

/** Supabase's default minimum password length. */
const MIN_PASSWORD_LENGTH = 6

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
 * Signup page (piano.md §1.5, "SignUp page").
 *
 * Email + password only. No profile creation, no session handling and no
 * redirect logic: those belong to the profiles table (§1.7) and the route
 * guards (§1.6).
 */
export default function Signup() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const trimmedEmail = email.trim()

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`)
      return
    }

    setLoading(true)

    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
      })

      if (signUpError) {
        setError(signUpError.message)
        return
      }

      // Supabase never reveals whether an address is already registered: it
      // returns a user with an empty `identities` array instead. Surface that
      // as a hint so the user does not wait for a mail that will not arrive.
      if (data.user?.identities?.length === 0) {
        setError(
          'This email address is already registered. Try logging in instead.',
        )
        return
      }

      // No session at this point: email confirmation is enabled, so the user
      // must open the link in the confirmation email before logging in.
      setSubmittedEmail(trimmedEmail)
      setPassword('')
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unexpected error. Please try again.',
      )
    } finally {
      setLoading(false)
    }
  }

  if (submittedEmail) {
    return (
      <main style={page}>
        <div style={card}>
          <h1>Check your email</h1>
          <p>
            We sent a confirmation link to <strong>{submittedEmail}</strong>. Open
            it to activate your account, then log in.
          </p>
          <p style={muted}>
            Nothing arrived? Check the spam folder and make sure the address is
            correct.
          </p>
          <p>
            <Link to="/login">Go to login</Link>
          </p>
        </div>
      </main>
    )
  }

  return (
    <main style={page}>
      <form style={card} onSubmit={handleSubmit} noValidate>
        <h1>Create account</h1>

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
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={loading}
          />
        </label>

        <small style={muted}>At least {MIN_PASSWORD_LENGTH} characters.</small>

        {error && (
          <p style={errorText} role="alert">
            {error}
          </p>
        )}

        <button type="submit" disabled={loading}>
          {loading ? 'Creating account…' : 'Sign up'}
        </button>

        <p style={muted}>
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </form>
    </main>
  )
}
