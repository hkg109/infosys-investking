import { adminMenu, gameMenu } from './navigation/menus'
import { Navigate, Route, Routes, useOutletContext } from 'react-router-dom'
import { useSession } from './auth/SessionContext'
import { lazy, Suspense } from 'react'
const AdminPage = lazy(() => import('./pages/AdminPage'))
const GamePage = lazy(() => import('./pages/GamePage'))
import HomePage from './pages/HomePage'
import BroadcastPage from './broadcast/BroadcastPage'

function ProtectedGameRoute() {
  const { status, user } = useSession()

  if (status === 'loading') {
    return <main className="route-status" aria-live="polite">참가 정보를 확인하고 있습니다.</main>
  }

  return user ? <GamePage /> : <Navigate to="/" replace />
}

function Section({ name }) { return useOutletContext()[name] }

function App() {
  return (
    <Suspense fallback={<main className="route-status">화면을 불러오고 있습니다.</main>}><Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/game" element={<ProtectedGameRoute />}>
        <Route index element={<Navigate to="market" replace />} />
        {gameMenu.map(([name]) => <Route key={name} path={name} element={<Section name={name} />} />)}
        <Route path="*" element={<Navigate to="/game/market" replace />} />
      </Route>
      <Route path="/admin" element={<AdminPage />}>
        <Route index element={<Navigate to="overview" replace />} />
        {adminMenu.map(([name]) => <Route key={name} path={name} element={<Section name={name} />} />)}
        <Route path="*" element={<Navigate to="/admin/overview" replace />} />
      </Route>
      <Route path="/broadcast" element={<BroadcastPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes></Suspense>
  )
}

export default App
