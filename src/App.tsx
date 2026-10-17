import { Navigate, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import { useAuth } from './contexts/AuthContext'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import Room from './pages/Room'
import Signup from './pages/Signup'

/**
 * Route table — implementation of "1.6 Route protection" (piano.md).
 *
 * BrowserRouter is mounted once in src/main.tsx; this file only declares the
 * routes. `/login` and `/signup` are public, `/dashboard` and `/room/:id` are
 * wrapped in <ProtectedRoute>. `PublicOnlyRoute` is not part of this step, so
 * the two auth pages are reachable while signed in; their forms simply report
 * the outcome.
 */

/**
 * `/` has no page of its own: it forwards to the dashboard for a signed-in
 * user and to the login screen otherwise. While the initial session retrieval
 * is still running it renders a waiting message, so refreshing `/` does not
 * flash the login screen at a user who is in fact signed in.
 */
function RootRedirect() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <main
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.5rem',
        }}
        aria-busy="true"
        aria-live="polite"
      >
        <p>Checking your session…</p>
      </main>
    )
  }

  return <Navigate to={user ? '/dashboard' : '/login'} replace />
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />

      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />

      {/* Placeholder target for the join flow of Phase 2. */}
      <Route
        path="/room/:id"
        element={
          <ProtectedRoute>
            <Room />
          </ProtectedRoute>
        }
      />

      {/* Unknown URLs fall back to `/`, which forwards by auth state. */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
