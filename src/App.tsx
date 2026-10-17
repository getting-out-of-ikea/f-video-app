import { useState } from 'react'
import { supabase } from './lib/supabase'

// TEMPORARY — Supabase connectivity probe.
// Remove together with the button in step 1.4/1.5 once AuthContext exists.

type TestState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; hasSession: boolean }
  | { status: 'error'; message: string }

function App() {
  const [test, setTest] = useState<TestState>({ status: 'idle' })

  async function handleTestSupabase() {
    setTest({ status: 'loading' })

    try {
      const { data, error } = await supabase.auth.getSession()

      if (error) {
        setTest({ status: 'error', message: error.message })
        return
      }

      // Only the presence of a session is reported — never its contents.
      setTest({ status: 'success', hasSession: data.session !== null })
    } catch (err) {
      setTest({
        status: 'error',
        message: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }

  return (
    <main>
      <h1>f-video-app</h1>
      <p>
        Project scaffolding is in place. Authentication, routing and video are
        implemented in later steps of the plan.
      </p>

      <button
        type="button"
        onClick={handleTestSupabase}
        disabled={test.status === 'loading'}
      >
        {test.status === 'loading' ? 'Testing…' : 'Test Supabase'}
      </button>

      {test.status === 'success' && (
        <p role="status">
          Success: the Supabase client responded.{' '}
          {test.hasSession
            ? 'A stored session was found.'
            : 'No stored session (expected — nobody has logged in yet).'}
        </p>
      )}

      {test.status === 'error' && <p role="alert">Error: {test.message}</p>}
    </main>
  )
}

export default App
