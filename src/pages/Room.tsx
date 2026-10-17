import type { CSSProperties } from 'react'
import { Link, useParams } from 'react-router-dom'

/**
 * Room page — placeholder for `/room/:id` (piano.md §2.3 onwards).
 *
 * Only the route and the room id from the URL exist at this point: there is no
 * pre-join screen, no token request and no LiveKit connection. The route param
 * is displayed so the wiring can be verified.
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
  maxWidth: '28rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.75rem',
}

const muted: CSSProperties = {
  color: '#555',
  fontSize: '0.875rem',
}

export default function Room() {
  const { id } = useParams<{ id: string }>()

  return (
    <main style={page}>
      <div style={card}>
        <h1>Room</h1>

        <p>
          Room id: <strong>{id ?? '(none)'}</strong>
        </p>

        <p style={muted}>
          This is a placeholder. The pre-join screen, device selection and the
          LiveKit connection are implemented in Phase 2.
        </p>

        <p>
          <Link to="/dashboard">Back to dashboard</Link>
        </p>
      </div>
    </main>
  )
}
