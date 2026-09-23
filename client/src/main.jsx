import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import App from './App'
import { SessionProvider } from './auth/SessionContext'
import './styles/global.css'

const router = createBrowserRouter([{ path: '*', element: <SessionProvider><App /></SessionProvider> }])

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
