import { Navigate, Route, Routes } from 'react-router-dom'
import Login from './pages/Login'
import Signup from './pages/Signup'

// Route table only. AuthContext and protected/public-only route guards are
// added in a later step (piano.md §1.4 / §1.6); BrowserRouter lives in
// src/main.tsx.
function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

export default App
