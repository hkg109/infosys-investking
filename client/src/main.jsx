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
import './styles/stage27.css'
import './styles/stage30.css'
import './styles/stage31.css'
import './styles/stage32.css'
import './styles/stage34.css'
import './styles/stage35-36.css'

const router = createBrowserRouter([{ path: '*', element: <SessionProvider><App /></SessionProvider> }])

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
