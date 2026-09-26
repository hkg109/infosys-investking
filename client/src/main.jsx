import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import '@fontsource-variable/space-grotesk'
import '@fontsource-variable/jetbrains-mono'
import App from './App'
import { SessionProvider } from './auth/SessionContext'
import '../tokens.css'
import './styles/global.css'
import './styles/hallmark.css'
import './styles/stage25.css'
import './styles/company-select.css'

const router = createBrowserRouter([{ path: '*', element: <SessionProvider><App /></SessionProvider> }])

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
