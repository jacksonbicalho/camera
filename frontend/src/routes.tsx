/* eslint-disable react-refresh/only-export-components */
import { lazy, Suspense } from 'react'
import { Route, useLocation, Navigate } from 'react-router-dom'
import { getToken, mustChangePassword } from './auth'

const LivePage = lazy(() => import('./pages/LivePage'))
const HistoryPage = lazy(() => import('./pages/HistoryPage'))
const VideoBrowserPage = lazy(() => import('./pages/VideoBrowserPage'))
const ReportsPage = lazy(() => import('./pages/ReportsPage'))
const AllCamerasPage = lazy(() => import('./pages/AllCamerasPage'))
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const RecordingsPage = lazy(() => import('./pages/RecordingsPage'))
const StatsPage = lazy(() => import('./pages/StatsPage'))
const SystemSettingsPage = lazy(() => import('./pages/settings/SystemSettingsPage'))
const ServerSettingsPage = lazy(() => import('./pages/settings/ServerSettingsPage'))
const StorageSettingsPage = lazy(() => import('./pages/settings/StorageSettingsPage'))
const UsersSettingsPage = lazy(() => import('./pages/settings/UsersSettingsPage'))
const UserDetailSettingsPage = lazy(() => import('./pages/settings/UserDetailSettingsPage'))
const AppearanceSettingsPage = lazy(() => import('./pages/settings/AppearanceSettingsPage'))
const AboutPage = lazy(() => import('./pages/settings/AboutPage'))

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  if (!getToken()) return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />
  if (mustChangePassword()) return <Navigate to="/change-password" replace />
  return <>{children}</>
}

export function Lazy({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <Suspense>{children}</Suspense>
    </RequireAuth>
  )
}

// routes — páginas que usam o `Layout` enxuto (ver CLAUDE.md): LivePage/
// HistoryPage/VideoBrowserPage substituíram o CameraPage legado (método
// estrangulamento — ver comentário no topo de VideoBrowserPage.tsx; CameraPage.tsx
// e suas dependências exclusivas foram removidos, assim como `legacyRoutes`).
export const routes = (
  <>
    <Route path="/" element={<Lazy><AllCamerasPage /></Lazy>} />
    <Route path="/live/:cameraId" element={<Lazy><LivePage /></Lazy>} />
    <Route path="/history/:cameraId" element={<Lazy><HistoryPage /></Lazy>} />
    <Route path="/history/:cameraId/:recordingId" element={<Lazy><HistoryPage /></Lazy>} />
    <Route path="/recording/:cameraId/:recordingId" element={<Lazy><VideoBrowserPage /></Lazy>} />
    <Route path="/recording/:cameraId/:recordingId/:motionId" element={<Lazy><VideoBrowserPage /></Lazy>} />
    <Route path="/reports/:cameraId/:date/:days" element={<Lazy><ReportsPage /></Lazy>} />
    <Route path="/dashboard" element={<Lazy><DashboardPage /></Lazy>} />
    <Route path="/recordings" element={<Lazy><RecordingsPage /></Lazy>} />
    <Route path="/recordings/:date" element={<Lazy><RecordingsPage /></Lazy>} />
    <Route path="/recordings/:date/:hour" element={<Lazy><RecordingsPage /></Lazy>} />
    <Route path="/recordings/:date/:hour/:view" element={<Lazy><RecordingsPage /></Lazy>} />
    {/* Estatísticas/Sistema/Servidor/Usuários/Armazenamento — migradas de SettingsLayout/
        AppLayout pro Layout novo. Rota canônica /preferences/*; os paths antigos /settings/*
        e /stats continuam registrados como alias pro MESMO componente (bookmarks, e o
        AppSidebar legado que ainda usa os paths novos via settingsNavLinks.ts — mas nada
        impede visita direta ao path antigo). */}
    <Route path="/preferences/stats" element={<Lazy><StatsPage /></Lazy>} />
    <Route path="/stats" element={<Lazy><StatsPage /></Lazy>} />
    <Route path="/preferences/system" element={<Lazy><SystemSettingsPage /></Lazy>} />
    <Route path="/settings/system" element={<Lazy><SystemSettingsPage /></Lazy>} />
    <Route path="/preferences/server" element={<Lazy><ServerSettingsPage /></Lazy>} />
    <Route path="/settings/server" element={<Lazy><ServerSettingsPage /></Lazy>} />
    <Route path="/preferences/storage" element={<Lazy><StorageSettingsPage /></Lazy>} />
    <Route path="/settings/storage" element={<Lazy><StorageSettingsPage /></Lazy>} />
    <Route path="/preferences/users" element={<Lazy><UsersSettingsPage /></Lazy>} />
    <Route path="/preferences/users/new" element={<Lazy><UsersSettingsPage /></Lazy>} />
    <Route path="/preferences/users/:id" element={<Lazy><UserDetailSettingsPage /></Lazy>} />
    <Route path="/settings/users" element={<Lazy><UsersSettingsPage /></Lazy>} />
    <Route path="/settings/users/new" element={<Lazy><UsersSettingsPage /></Lazy>} />
    <Route path="/settings/users/:id" element={<Lazy><UserDetailSettingsPage /></Lazy>} />
    <Route path="/preferences/appearance" element={<Lazy><AppearanceSettingsPage /></Lazy>} />
    <Route path="/settings/appearance" element={<Lazy><AppearanceSettingsPage /></Lazy>} />
    <Route path="/preferences/about" element={<Lazy><AboutPage /></Lazy>} />
    <Route path="/settings/about" element={<Lazy><AboutPage /></Lazy>} />
  </>
)
