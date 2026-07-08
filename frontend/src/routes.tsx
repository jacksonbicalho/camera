/* eslint-disable react-refresh/only-export-components */
import { lazy, Suspense } from 'react'
import { Route, useLocation, Navigate } from 'react-router-dom'
import { getToken, mustChangePassword } from './auth'

const CameraPage = lazy(() => import('./pages/CameraPage'))
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

// newRoutes — páginas da refatoração de simplificação em andamento (usam o `Layout` enxuto,
// ver CLAUDE.md): LivePage/HistoryPage/VideoBrowserPage vêm substituindo o CameraPage legado
// (método estrangulamento — ver comentário no topo de VideoBrowserPage.tsx).
export const newRoutes = (
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
  </>
)

// legacyRoutes — CameraPage (AppLayout pesado) e suas rotas antigas. Candidatas a remoção
// quando LivePage/HistoryPage/VideoBrowserPage cobrirem tudo que o CameraPage ainda faz.
export const legacyRoutes = (
  <>
    <Route path="/cameras/:id" element={<Lazy><CameraPage /></Lazy>} />
    <Route path="/camera/live/:id" element={<Lazy><CameraPage /></Lazy>} />
    <Route path="/camera/recording/:id/:recording_id" element={<Lazy><CameraPage /></Lazy>} />
  </>
)
