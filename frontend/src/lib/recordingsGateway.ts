import { authHeaders, getToken } from '../auth'

// RecordingsGateway é o ÚNICO intermediário entre a página e o backend no que diz
// respeito a gravações — o único ponto de verdade. Módulo puro com `fetch` injetável
// (testável sem rede). A página nova (VideoBrowserPage) consome só este gateway; nada
// de fetch cru espalhado como no CameraPage legado.

export interface Recording {
  id: number
  filename: string
  start: string // ISO — start exato (cravado no filename YYYYMMDDHHmmss.mp4)
  end?: string // ISO — ended_at real; ausente no chunk em gravação (cai no fim inferido)
  url: string
  is_recording: boolean
  has_motion: boolean
}

export interface GatewayEvent {
  id: number
  time: string // occurred_at (ISO)
  score: number
  frame?: string
  label?: string
  color?: string
  bbox?: { x: number; y: number; w: number; h: number }
}

// Um recorte de um chunk que a janela do clip cruza. Reproduzir o clip = concatenar
// os segmentos em ordem, avançando de um para o próximo ao chegar em toSeconds.
export interface ClipSegment {
  recording: Recording
  fromSeconds: number
  toSeconds: number
}

export const UNAUTHORIZED = 'unauthorized' as const
export type Unauthorized = typeof UNAUTHORIZED

// ymd formata a data local no formato yyyy-MM-dd (o dia é interpretado no fuso local,
// igual ao resto do app).
function ymd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// clipSegments monta a playlist de segmentos que cobre a janela do evento
// [occurred − lead, occurred + trail]. É a ÚNICA implementação do "mapa temporal":
// as gravações só expõem `start`, então o fim de cada chunk é o `start` do próximo
// (o último vai até +∞ — a duração real é clampada na reprodução ao carregar a
// metadata). Pula o chunk `is_recording` (não é arquivo seekável) e chunks sem
// sobreposição com a janela (vãos). fromSeconds/toSeconds já saem clampados a
// [0, duração-inferida] porque a sobreposição é calculada dentro de [start, end).
export function clipSegments(
  occurredAtISO: string,
  recordings: Recording[],
  leadSec: number,
  trailSec: number,
): ClipSegment[] {
  const ev = Date.parse(occurredAtISO)
  if (Number.isNaN(ev)) return []
  const w0 = ev - leadSec * 1000
  const w1 = ev + trailSec * 1000

  const asc = recordings
    .filter(r => !Number.isNaN(Date.parse(r.start)))
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))

  const segments: ClipSegment[] = []
  for (let i = 0; i < asc.length; i++) {
    const r = asc[i]
    if (r.is_recording) continue
    const start = Date.parse(r.start)
    // Fim do chunk: o `ended_at` real quando presente (preciso — não cobre o vão entre
    // o fim real e o próximo start); senão infere o start do próximo chunk (mesmo que ele
    // seja o chunk em gravação) e, no último, fica aberto (+∞).
    const realEnd = r.end ? Date.parse(r.end) : NaN
    const end = !Number.isNaN(realEnd)
      ? realEnd
      : i + 1 < asc.length
        ? Date.parse(asc[i + 1].start)
        : Infinity
    const from = Math.max(w0, start)
    const to = Math.min(w1, end)
    if (from >= to) continue // sem sobreposição com a janela
    segments.push({
      recording: r,
      fromSeconds: (from - start) / 1000,
      toSeconds: (to - start) / 1000,
    })
  }
  return segments
}

type FetchFn = typeof fetch

export class RecordingsGateway {
  private fetchFn: FetchFn

  constructor(opts: { fetchFn?: FetchFn } = {}) {
    this.fetchFn = opts.fetchFn ?? globalThis.fetch.bind(globalThis)
  }

  // listByDay carrega TODAS as gravações do dia (limit=0) — necessário para montar o
  // clip cross-boundary (precisa dos vizinhos do chunk-âncora). `signal` opcional permite
  // ao chamador abortar a requisição de verdade (não só ignorar o resultado) — usado pelo
  // VideoBrowserPage para cancelar no cleanup do efeito em vez de só descartar a resposta.
  async listByDay(
    cameraId: string,
    date: Date,
    order: 'asc' | 'desc' = 'desc',
    signal?: AbortSignal,
  ): Promise<Recording[] | Unauthorized> {
    const res = await this.fetchFn(
      `/api/cameras/${cameraId}/recordings?date=${ymd(date)}&page=1&limit=0&order=${order}`,
      { headers: authHeaders(), signal },
    )
    if (res.status === 401) return UNAUTHORIZED
    const data = await res.json()
    return data.recordings ?? []
  }

  // getRecording resolve o chunk-âncora pelo id → {filename, date}. A gravação completa
  // (com start/url/is_recording) vem do listByDay do dia resolvido.
  async getRecording(
    cameraId: string,
    recId: string | number,
    signal?: AbortSignal,
  ): Promise<{ filename: string; date: string } | null> {
    const res = await this.fetchFn(`/api/cameras/${cameraId}/recordings/by-id/${recId}`, {
      headers: authHeaders(),
      signal,
    })
    if (!res.ok) return null
    return res.json()
  }

  // getEvent busca o evento de movimento pelo id — de onde sai o `occurred_at` (time)
  // usado no cálculo do offset/janela do clip.
  async getEvent(motionId: string | number, signal?: AbortSignal): Promise<GatewayEvent | null> {
    const res = await this.fetchFn(`/api/events/${motionId}`, { headers: authHeaders(), signal })
    if (!res.ok) return null
    return res.json()
  }

  // getPlaybackWindow devolve o lead/trail (segundos) da câmera — as bordas da janela do
  // clip. Vive no gateway para a página não fazer fetch cru: o intermediário é o único
  // ponto de verdade de tudo que é preciso para reproduzir uma gravação. Default 10/10.
  async getPlaybackWindow(cameraId: string, signal?: AbortSignal): Promise<{ lead: number; trail: number }> {
    const res = await this.fetchFn('/api/cameras', { headers: authHeaders(), signal })
    if (!res.ok) return { lead: 10, trail: 10 }
    const list = (await res.json()) as Array<{
      id: string
      playback_lead_seconds?: number
      playback_trail_seconds?: number
    }>
    const cam = list.find(c => c.id === cameraId)
    return { lead: cam?.playback_lead_seconds ?? 10, trail: cam?.playback_trail_seconds ?? 10 }
  }

  // getTimezone devolve o fuso configurado da instalação (`/api/config`), usado para
  // localizar horários de gravações/eventos. Vive no gateway para a página não fazer fetch
  // cru; default UTC. (Convenção do app: UTC no fio, cliente formata.)
  async getTimezone(): Promise<string> {
    const res = await this.fetchFn('/api/config')
    if (!res.ok) return 'UTC'
    const data = await res.json()
    return data.timezone || 'UTC'
  }

  // playbackURL monta a URL servível do .mp4 com o token (necessário no <video src>).
  playbackURL(recording: Recording): string {
    return `${recording.url}?token=${getToken()}`
  }
}
