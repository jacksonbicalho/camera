/* eslint-disable react-refresh/only-export-components */
import { lazy, Suspense } from 'react'
import { Route, useLocation, Navigate } from 'react-router-dom'
import { getToken, mustChangePassword } from './auth'

const CameraPage = lazy(() => import('./pages/CameraPage'))
const LivePage = lazy(() => import('./pages/LivePage'))
const HistoryPage = lazy(() => import('./pages/HistoryPage'))
const VideoBrowserPage = lazy(() => import('./pages/VideoBrowserPage'))

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
    <Route path="/live/:cameraId" element={<Lazy><LivePage /></Lazy>} />
    <Route path="/history/:cameraId" element={<Lazy><HistoryPage /></Lazy>} />
    <Route path="/history/:cameraId/:recordingId" element={<Lazy><HistoryPage /></Lazy>} />
    <Route path="/recording/:cameraId/:recordingId" element={<Lazy><VideoBrowserPage /></Lazy>} />
    <Route path="/recording/:cameraId/:recordingId/:motionId" element={<Lazy><VideoBrowserPage /></Lazy>} />
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
