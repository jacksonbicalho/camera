import { lazy, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { newRoutes, legacyRoutes, Lazy } from './routes'
import LoginPage from './pages/LoginPage'
import ChangePasswordPage from './pages/ChangePasswordPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import { SidebarItemsProvider } from './contexts/SidebarContext'
import { DisplayModeProvider } from './contexts/DisplayModeContext'
import { AlertProvider } from './contexts/AlertContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { NotificationProvider } from './contexts/NotificationContext'
import { UserNotificationProvider } from './contexts/UserNotificationContext'

const StatsPage = lazy(() => import('./pages/StatsPage'))
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'))
const CamerasSettingsPage = lazy(() => import('./pages/settings/CamerasSettingsPage'))
const CameraDetailSettingsPage = lazy(() => import('./pages/settings/CameraDetailSettingsPage'))
const CameraMotionSettingsPage = lazy(() => import('./pages/settings/CameraMotionSettingsPage'))
const CameraZonesSettingsPage = lazy(() => import('./pages/settings/CameraZonesSettingsPage'))
const CameraStatesSettingsPage = lazy(() => import('./pages/settings/CameraStatesSettingsPage'))
const ServerSettingsPage = lazy(() => import('./pages/settings/ServerSettingsPage'))
const StorageSettingsPage = lazy(() => import('./pages/settings/StorageSettingsPage'))
const SystemSettingsPage = lazy(() => import('./pages/settings/SystemSettingsPage'))
const AboutPage = lazy(() => import('./pages/settings/AboutPage'))
const UsersSettingsPage = lazy(() => import('./pages/settings/UsersSettingsPage'))
const UserDetailSettingsPage = lazy(() => import('./pages/settings/UserDetailSettingsPage'))
const DiscoverPage = lazy(() => import('./pages/settings/DiscoverPage'))
const AnalysisSettingsPage = lazy(() => import('./pages/settings/AnalysisSettingsPage'))
const CameraAnalysisSettingsPage = lazy(() => import('./pages/settings/CameraAnalysisSettingsPage'))
const AppearanceSettingsPage = lazy(() => import('./pages/settings/AppearanceSettingsPage'))
const PlaceholderPage = lazy(() => import('./pages/PlaceholderPage'))
const ProfilePage = lazy(() => import('./pages/ProfilePage'))
const ProfileChangePasswordPage = lazy(() => import('./pages/ProfileChangePasswordPage'))

function UnauthorizedHandler() {
  const navigate = useNavigate()
  const location = useLocation()
  useEffect(() => {
    const handler = () => navigate('/login', { state: { from: location.pathname + location.search }, replace: true })
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
    <AlertProvider>
    <SidebarItemsProvider>
    <UnauthorizedHandler />
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/change-password" element={<ChangePasswordPage />} />
      {newRoutes}
      {legacyRoutes}
      <Route path="/stats" element={<Lazy><StatsPage /></Lazy>} />
      <Route path="/events" element={<Lazy><PlaceholderPage title="Eventos" description="Visão global de eventos em construção." /></Lazy>} />
      <Route path="/users" element={<Lazy><PlaceholderPage title="Usuários" description="Gestão de usuários em construção." /></Lazy>} />
      <Route path="/notifications" element={<Lazy><NotificationsPage /></Lazy>} />
      <Route path="/profile" element={<Lazy><ProfilePage /></Lazy>} />
      <Route path="/profile/change-password" element={<Lazy><ProfileChangePasswordPage /></Lazy>} />
      <Route path="/settings/cameras" element={<Lazy><CamerasSettingsPage /></Lazy>} />
      <Route path="/settings/cameras/new" element={<Lazy><CamerasSettingsPage /></Lazy>} />
      <Route path="/settings/cameras/edit/:id" element={<Lazy><CameraDetailSettingsPage /></Lazy>} />
      <Route path="/settings/cameras/motion/:id" element={<Lazy><CameraMotionSettingsPage /></Lazy>} />
      <Route path="/settings/cameras/zones/:id" element={<Lazy><CameraZonesSettingsPage /></Lazy>} />
      <Route path="/settings/cameras/analysis/:id" element={<Lazy><CameraAnalysisSettingsPage /></Lazy>} />
      <Route path="/settings/cameras/states/:id" element={<Lazy><CameraStatesSettingsPage /></Lazy>} />
      <Route path="/settings/cameras/:id/states/edit/:cid" element={<Lazy><CameraStatesSettingsPage /></Lazy>} />
      <Route path="/settings/cameras/:id" element={<Lazy><CameraDetailSettingsPage /></Lazy>} />
      <Route path="/settings/server" element={<Lazy><ServerSettingsPage /></Lazy>} />
      <Route path="/settings/storage" element={<Lazy><StorageSettingsPage /></Lazy>} />
      <Route path="/settings/system" element={<Lazy><SystemSettingsPage /></Lazy>} />
      <Route path="/settings/about" element={<Lazy><AboutPage /></Lazy>} />
      <Route path="/settings/users" element={<Lazy><UsersSettingsPage /></Lazy>} />
      <Route path="/settings/users/new" element={<Lazy><UsersSettingsPage /></Lazy>} />
      <Route path="/settings/users/:id" element={<Lazy><UserDetailSettingsPage /></Lazy>} />
      <Route path="/settings/discover" element={<Lazy><DiscoverPage /></Lazy>} />
      <Route path="/settings/analysis" element={<Lazy><AnalysisSettingsPage /></Lazy>} />
      <Route path="/settings/appearance" element={<Lazy><AppearanceSettingsPage /></Lazy>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </SidebarItemsProvider>
    </AlertProvider>
    </DisplayModeProvider>
    </UserNotificationProvider>
    </NotificationProvider>
    </ThemeProvider>
    </BrowserRouter>
  )
}
