import { lazy, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { routes, Lazy } from './routes'
import LoginPage from './pages/LoginPage'
import ChangePasswordPage from './pages/ChangePasswordPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import { DisplayModeProvider } from './contexts/DisplayModeContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { NotificationProvider } from './contexts/NotificationContext'
import { UserNotificationProvider } from './contexts/UserNotificationContext'

const ProfilePage = lazy(() => import('./pages/ProfilePage'))
const ProfileChangePasswordPage = lazy(() => import('./pages/ProfileChangePasswordPage'))

function UnauthorizedHandler() {
  const navigate = useNavigate()
  const location = useLocation()
  useEffect(() => {
    const handler = () =>
      navigate('/login', { state: { from: location.pathname + location.search }, replace: true })
    window.addEventListener('camera:unauthorized', handler)
    return () => window.removeEventListener('camera:unauthorized', handler)
  }, [navigate, location])
  return null
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <NotificationProvider>
          <UserNotificationProvider>
            <DisplayModeProvider>
              <UnauthorizedHandler />
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />
                <Route path="/change-password" element={<ChangePasswordPage />} />
                {routes}
                <Route
                  path="/profile"
                  element={
                    <Lazy>
                      <ProfilePage />
                    </Lazy>
                  }
                />
                <Route
                  path="/profile/edit"
                  element={
                    <Lazy>
                      <ProfilePage />
                    </Lazy>
                  }
                />
                <Route
                  path="/profile/change-email"
                  element={
                    <Lazy>
                      <ProfilePage />
                    </Lazy>
                  }
                />
                <Route
                  path="/profile/change-password"
                  element={
                    <Lazy>
                      <ProfileChangePasswordPage />
                    </Lazy>
                  }
                />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </DisplayModeProvider>
          </UserNotificationProvider>
        </NotificationProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}
