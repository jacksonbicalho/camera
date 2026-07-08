import { authHeaders } from '../auth'
import { format } from 'date-fns'

// resolveEventRecordingUrl — resolve a URL de reprodução (/recording/:cameraId/
// :recordingId(/:motionId)?, VideoBrowserPage) pra um instante ISO numa câmera.
// Único ponto de resolução de recordingId/motionId do app — usado por qualquer
// clique em notificação/momento/evento que só tem câmera+instante (sem id de
// gravação nem de evento já resolvidos): sino de notificações
// (MotionNotificationsBell), clique em notificação do navegador
// (NotificationContext), clique num "momento" (RecordingsPage) e "Ver na
// gravação" do histórico de estado (CameraStatesSettingsPage).
//
// A notificação/momento só carrega camera_id/time (às vezes score/label) — nem o
// id numérico do evento (motion_events.id) nem uma gravação. Resolve os dois:
// busca os eventos do dia (GET .../motion?date=) pra achar o evento com o mesmo
// `time` (dá o :motionId — ignora entradas kind==="state", que são transições de
// estado misturadas no mesmo feed e não têm registro em motion_events) e as
// gravações do dia (GET .../recordings?date=) pra escolher a gravação-âncora (dá
// o :recordingId). Sem gravação nenhuma no dia, ou falha de rede, devolve `null`
// (quem chama decide o que fazer — normalmente não navegar).
interface MotionEventEntry {
  id: number
  time: string
  kind?: string
}

interface RecordingEntry {
  id: number
  start: string
}

// anchorRecording escolhe a gravação-âncora do dia pro clip: a última que começou
// antes (ou no exato instante) do evento, ou a primeira do dia se o evento for
// anterior a todas. `VideoBrowserPage` só usa o :recordingId da URL pra resolver o
// DIA (recomputa os segmentos a partir do :motionId) — não precisa ser exatamente a
// gravação que contém o evento.
function anchorRecording(recordings: RecordingEntry[], iso: string): number | null {
  const t = Date.parse(iso)
  const asc = [...recordings].sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
  let candidate: RecordingEntry | null = null
  for (const r of asc) {
    if (Date.parse(r.start) <= t) candidate = r
    else break
  }
  return (candidate ?? asc[0])?.id ?? null
}

export async function resolveEventRecordingUrl(cameraId: string, isoTime: string): Promise<string | null> {
  const dateStr = format(new Date(isoTime), 'yyyy-MM-dd')
  try {
    const [evRes, recRes] = await Promise.all([
      fetch(`/api/cameras/${cameraId}/motion?date=${dateStr}`, { headers: authHeaders() }),
      fetch(`/api/cameras/${cameraId}/recordings?date=${dateStr}&page=1&limit=0&order=asc`, { headers: authHeaders() }),
    ])
    const evData = evRes.ok ? await evRes.json() : {}
    const events: MotionEventEntry[] = evData.events ?? []
    const recData = recRes.ok ? await recRes.json() : {}
    const recordings: RecordingEntry[] = recData.recordings ?? []

    const recordingId = anchorRecording(recordings, isoTime)
    if (recordingId == null) return null

    const match = events.find((e) => !e.kind && e.time === isoTime)
    return match ? `/recording/${cameraId}/${recordingId}/${match.id}` : `/recording/${cameraId}/${recordingId}`
  } catch {
    return null
  }
}
