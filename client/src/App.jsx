import { Navigate, Route, Routes } from 'react-router-dom'
import { useSession } from './auth/SessionContext'
import AdminPage from './pages/AdminPage'
import GamePage from './pages/GamePage'
import HomePage from './pages/HomePage'
import BroadcastPage from './broadcast/BroadcastPage'

function ProtectedGameRoute() {
  const { status, user } = useSession()

  if (status === 'loading') {
    return <main className="route-status" aria-live="polite">참가 정보를 확인하고 있습니다.</main>
  }

  return user ? <GamePage /> : <Navigate to="/" replace />
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/game" element={<ProtectedGameRoute />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/broadcast" element={<BroadcastPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
