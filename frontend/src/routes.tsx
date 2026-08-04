/* eslint-disable react-refresh/only-export-components */
import { lazy, Suspense } from 'react'
import { Route, useLocation, Navigate } from 'react-router-dom'
import { getToken, mustChangePassword } from './auth'

const LivePage = lazy(() => import('./pages/LivePage'))
const HistoryPage = lazy(() => import('./pages/HistoryPage'))
const HistoryLandingPage = lazy(() => import('./pages/HistoryLandingPage'))
const VideoBrowserPage = lazy(() => import('./pages/VideoBrowserPage'))
const ReportsPage = lazy(() => import('./pages/ReportsPage'))
const RecordingsPage = lazy(() => import('./pages/RecordingsPage'))
const MotionsPage = lazy(() => import('./pages/MotionsPage'))
const LiveViewPage = lazy(() => import('./pages/LiveViewPage'))
const ServerSettingsPage = lazy(() => import('./pages/settings/ServerSettingsPage'))
const StorageSettingsPage = lazy(() => import('./pages/settings/StorageSettingsPage'))
const UsersSettingsPage = lazy(() => import('./pages/settings/UsersSettingsPage'))
const UserDetailSettingsPage = lazy(() => import('./pages/settings/UserDetailSettingsPage'))
const AppearanceSettingsPage = lazy(() => import('./pages/settings/AppearanceSettingsPage'))
const AboutPage = lazy(() => import('./pages/settings/AboutPage'))
const CamerasSettingsPage = lazy(() => import('./pages/settings/CamerasSettingsPage'))
const CameraDetailSettingsPage = lazy(() => import('./pages/settings/CameraDetailSettingsPage'))
const CameraMotionSettingsPage = lazy(() => import('./pages/settings/CameraMotionSettingsPage'))
const CameraZonesSettingsPage = lazy(() => import('./pages/settings/CameraZonesSettingsPage'))
const CameraAnalysisSettingsPage = lazy(() => import('./pages/settings/CameraAnalysisSettingsPage'))
const CameraStatesSettingsPage = lazy(() => import('./pages/settings/CameraStatesSettingsPage'))
const DiscoverPage = lazy(() => import('./pages/settings/DiscoverPage'))
const AnalysisSettingsPage = lazy(() => import('./pages/settings/AnalysisSettingsPage'))
const LabelEventsPage = lazy(() => import('./pages/settings/LabelEventsPage'))
const ObjectDetectorsSettingsPage = lazy(
  () => import('./pages/settings/ObjectDetectorsSettingsPage'),
)
const ObjectDetectorFormPage = lazy(() => import('./pages/settings/ObjectDetectorFormPage'))
const ObjectDetectorTestPage = lazy(() => import('./pages/settings/ObjectDetectorTestPage'))
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'))

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  if (!getToken())
    return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />
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
    <Route
      path="/"
      element={
        <Lazy>
          <LiveViewPage />
        </Lazy>
      }
    />
    <Route
      path="/live/:cameraId"
      element={
        <Lazy>
          <LivePage />
        </Lazy>
      }
    />
    <Route
      path="/history"
      element={
        <Lazy>
          <HistoryLandingPage />
        </Lazy>
      }
    />
    <Route
      path="/history/:cameraId"
      element={
        <Lazy>
          <HistoryPage />
        </Lazy>
      }
    />
    <Route
      path="/history/:cameraId/:recordingId"
      element={
        <Lazy>
          <HistoryPage />
        </Lazy>
      }
    />
    <Route
      path="/history/:cameraId/:recordingId/:motionId"
      element={
        <Lazy>
          <HistoryPage />
        </Lazy>
      }
    />
    <Route
      path="/recording/:cameraId/:recordingId"
      element={
        <Lazy>
          <VideoBrowserPage />
        </Lazy>
      }
    />
    <Route
      path="/recording/:cameraId/:recordingId/:motionId"
      element={
        <Lazy>
          <VideoBrowserPage />
        </Lazy>
      }
    />
    <Route
      path="/recordings"
      element={
        <Lazy>
          <RecordingsPage />
        </Lazy>
      }
    />
    <Route
      path="/recordings/:date"
      element={
        <Lazy>
          <RecordingsPage />
        </Lazy>
      }
    />
    <Route
      path="/recordings/:date/:hour"
      element={
        <Lazy>
          <RecordingsPage />
        </Lazy>
      }
    />
    <Route
      path="/recordings/:date/:hour/:view"
      element={
        <Lazy>
          <RecordingsPage />
        </Lazy>
      }
    />
    <Route
      path="/motions"
      element={
        <Lazy>
          <MotionsPage />
        </Lazy>
      }
    />
    <Route
      path="/motions/:date"
      element={
        <Lazy>
          <MotionsPage />
        </Lazy>
      }
    />
    {/* Todo o settings usa Layout novo agora (SettingsLayout/AppLayout legado
        fechado) — um único ícone "Configurações" no Sidebar novo, tudo canonizado
        em /settings/*. StatsPage (/settings/stats, /stats) foi removida — seu
        conteúdo migrou pra dentro de /settings/server (história
        reorganizar-sidebar-governanca). */}
    <Route
      path="/settings/server"
      element={
        <Lazy>
          <ServerSettingsPage />
        </Lazy>
      }
    />
    <Route
      path="/settings/storage"
      element={
        <Lazy>
          <StorageSettingsPage />
        </Lazy>
      }
    />
    <Route
      path="/settings/storage/edit"
      element={
        <Lazy>
          <StorageSettingsPage />
        </Lazy>
      }
    />
    <Route
      path="/reports"
      element={
        <Lazy>
          <ReportsPage />
        </Lazy>
      }
    />
    <Route
      path="/reports/:cameraId/:date/:days"
      element={
        <Lazy>
          <ReportsPage />
        </Lazy>
      }
    />
    <Route
      path="/settings/users"
      element={
        <Lazy>
          <UsersSettingsPage />
        </Lazy>
      }
    />
    <Route
      path="/settings/users/new"
      element={
        <Lazy>
          <UsersSettingsPage />
        </Lazy>
      }
    />
    <Route
      path="/settings/users/:id"
      element={
        <Lazy>
          <UserDetailSettingsPage />
        </Lazy>
      }
    />
    <Route
      path="/settings/users/edit/:id"
      element={
        <Lazy>
          <UserDetailSettingsPage />
        </Lazy>
      }
    />
    <Route
      path="/settings/detectors"
      element={
        <Lazy>
          <ObjectDetectorsSettingsPage />
        </Lazy>
      }
    />
    <Route
      path="/settings/detectors/new"
      element={
        <Lazy>
          <ObjectDetectorsSettingsPage />
        </Lazy>
      }
    />
    <Route
      path="/settings/detectors/edit/:id"
      element={
        <Lazy>
          <ObjectDetectorFormPage />
        </Lazy>
      }
    />
    <Route
      path="/settings/detectors/test/:id"
      element={
        <Lazy>
          <ObjectDetectorTestPage />
        </Lazy>
      }
    />
    <Route
      path="/settings/appearance"
      element={
        <Lazy>
          <AppearanceSettingsPage />
        </Lazy>
      }
    />
    <Route
      path="/settings/about"
      element={
        <Lazy>
          <AboutPage />
        </Lazy>
      }
    />
    <Route
      path="/settings/cameras"
      element={
        <Lazy>
          <CamerasSettingsPage />
        </Lazy>
      }
    />
    <Route
      path="/settings/cameras/new"
      element={
        <Lazy>
          <CamerasSettingsPage />
        </Lazy>
      }
    />
    <Route
      path="/settings/cameras/edit/:id"
      element={
        <Lazy>
          <CameraDetailSettingsPage />
        </Lazy>
      }
    />
    <Route
      path="/settings/cameras/motion/:id"
      element={
        <Lazy>
          <CameraMotionSettingsPage />
        </Lazy>
      }
    />
    <Route
      path="/settings/cameras/zones/:id"
      element={
        <Lazy>
          <CameraZonesSettingsPage />
        </Lazy>
      }
    />
    <Route
      path="/settings/cameras/analysis/:id"
      element={
        <Lazy>
          <CameraAnalysisSettingsPage />
        </Lazy>
      }
    />
    <Route
      path="/settings/cameras/states/:id"
      element={
        <Lazy>
          <CameraStatesSettingsPage />
        </Lazy>
      }
    />
    <Route
      path="/settings/cameras/:id/states/edit/:cid"
      element={
        <Lazy>
          <CameraStatesSettingsPage />
        </Lazy>
      }
    />
    <Route
      path="/settings/cameras/:id"
      element={
        <Lazy>
          <CameraDetailSettingsPage />
        </Lazy>
      }
    />
    <Route
      path="/settings/discover"
      element={
        <Lazy>
          <DiscoverPage />
        </Lazy>
      }
    />
    <Route
      path="/settings/analysis"
      element={
        <Lazy>
          <AnalysisSettingsPage />
        </Lazy>
      }
    />
    <Route
      path="/settings/label-events"
      element={
        <Lazy>
          <LabelEventsPage />
        </Lazy>
      }
    />
    {/* AppLayout/AppSidebar legado fechado — /change-password fica em App.tsx, fora
        do <Lazy>, porque RequireAuth redireciona pra lá quando mustChangePassword()
        (envolvê-la em Lazy causaria loop de redirect). */}
    <Route
      path="/notifications"
      element={
        <Lazy>
          <NotificationsPage />
        </Lazy>
      }
    />
  </>
)
