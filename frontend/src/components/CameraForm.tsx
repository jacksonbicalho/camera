import { useState } from 'react'
import { type Camera, type CameraFormData, RESOLUTIONS, emptyForm } from './cameraFormUtils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { authHeaders } from '../auth'

interface CameraFormProps {
  initial?: Camera
  prefillRtsp?: string
  prefillName?: string
  onSave: (data: CameraFormData) => Promise<void>
  onCancel: () => void
  saving: boolean
}

export default function CameraForm({
  initial,
  prefillRtsp,
  prefillName,
  onSave,
  onCancel,
  saving,
}: CameraFormProps) {
  const [form, setForm] = useState<CameraFormData>(() => {
    const base = emptyForm(initial)
    if (prefillRtsp) base.rtsp_url = prefillRtsp
    if (prefillName) base.name = prefillName
    return base
  })
  // editing mode when `initial` is provided
  const [detecting, setDetecting] = useState(false)
  const [detectMsg, setDetectMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [detectingLive, setDetectingLive] = useState(false)
  const [liveDetectMsg, setLiveDetectMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [liveRecommended, setLiveRecommended] = useState<string>('')

  const set = (field: keyof CameraFormData, value: string | boolean | number) =>
    setForm((prev) => ({ ...prev, [field]: value }))

  const handleDetectSubstream = async () => {
    const main = form.rtsp_url.trim()
    if (!main) return
    setDetecting(true)
    setDetectMsg(null)
    try {
      const res = await fetch('/api/settings/cameras/detect-substream', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ rtsp_url: main, id: initial?.id }),
      })
      if (!res.ok) throw new Error('request failed')
      const data = (await res.json()) as {
        motion_rtsp_url?: string
        width?: number
        height?: number
      }
      if (data.motion_rtsp_url) {
        setForm((prev) => ({ ...prev, motion_rtsp_url: data.motion_rtsp_url! }))
        setDetectMsg({ text: `Substream detectado: ${data.width}×${data.height}`, ok: true })
      } else {
        setDetectMsg({ text: 'Nenhum substream encontrado — informe manualmente.', ok: false })
      }
    } catch {
      setDetectMsg({ text: 'Erro ao detectar — verifique a URL principal.', ok: false })
    } finally {
      setDetecting(false)
    }
  }

  const handleDetectStreams = async () => {
    const main = form.rtsp_url.trim()
    if (!main) return
    setDetectingLive(true)
    setLiveDetectMsg(null)
    try {
      const res = await fetch('/api/settings/cameras/detect-streams', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ rtsp_url: main, id: initial?.id }),
      })
      if (!res.ok) throw new Error('request failed')
      const data = (await res.json()) as {
        codec?: string
        width?: number
        height?: number
        recommended?: string
      }
      if (data.codec) {
        setLiveRecommended(data.recommended ?? '')
        const rec =
          data.recommended === 'webrtc'
            ? 'WebRTC recomendado (baixa latência)'
            : 'HLS recomendado — WebRTC indisponível para este codec'
        setLiveDetectMsg({
          text: `Codec detectado: ${data.codec.toUpperCase()} — ${rec}`,
          ok: data.recommended === 'webrtc',
        })
      } else {
        setLiveRecommended('')
        setLiveDetectMsg({
          text: 'Não foi possível detectar o codec — verifique a URL principal.',
          ok: false,
        })
      }
    } catch {
      setLiveDetectMsg({ text: 'Erro ao detectar — verifique a URL principal.', ok: false })
    } finally {
      setDetectingLive(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave(form)
  }

  const selectClass =
    'w-full bg-background border border-border rounded px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary'
  const labelClass = 'block text-xs text-muted-foreground mb-1'

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* Nome — sessão própria, sozinha */}
      <div>
        <Label htmlFor="camera-form-name" className={labelClass}>
          Nome
        </Label>
        <Input
          id="camera-form-name"
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          required
          placeholder="Sala, Garagem, Entrada"
        />
      </div>

      {/* Captura — sempre visível: propriedades da conexão em si (protocolo, URL,
          stream detectado, política de reconexão) — não de gravação/transmissão/movimento */}
      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        <p className="text-h4 text-muted-foreground uppercase tracking-wider font-medium px-5 pt-4 pb-3 border-b border-border">
          Captura
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-5">
          <div>
            <Label htmlFor="camera-capture-type" className={labelClass}>
              Protocolo
            </Label>
            <select
              id="camera-capture-type"
              value={form.capture_type}
              onChange={(e) => set('capture_type', e.target.value)}
              className={selectClass}
            >
              <option value="rtsp">RTSP</option>
              <option value="hls">HLS</option>
            </select>
          </div>
          <div>
            <Label htmlFor="camera-form-rtsp-url" className={labelClass}>
              {form.capture_type === 'hls' ? 'URL HLS' : 'RTSP URL'}
            </Label>
            <Input
              id="camera-form-rtsp-url"
              value={form.rtsp_url}
              onChange={(e) => set('rtsp_url', e.target.value)}
              required
              placeholder={
                form.capture_type === 'hls'
                  ? 'https://exemplo.com/stream/playlist.m3u8'
                  : 'rtsp://usuario:senha@ip:554/stream'
              }
            />
          </div>
          <div>
            <Label htmlFor="camera-form-video-codec" className={labelClass}>
              Codec de vídeo
            </Label>
            <select
              id="camera-form-video-codec"
              value={form.video_codec}
              onChange={(e) => set('video_codec', e.target.value)}
              className={selectClass}
            >
              <option value="">Auto (ffprobe detecta)</option>
              <option value="h264">H.264 / AVC</option>
              <option value="hevc">HEVC / H.265</option>
              <option value="mjpeg">MJPEG</option>
              <option value="mpeg4">MPEG-4</option>
            </select>
          </div>
          <div>
            <Label htmlFor="camera-form-has-audio" className={labelClass}>
              Áudio
            </Label>
            <select
              id="camera-form-has-audio"
              value={form.has_audio}
              onChange={(e) => set('has_audio', e.target.value)}
              className={selectClass}
            >
              <option value="">Auto</option>
              <option value="true">Sim</option>
              <option value="false">Não</option>
            </select>
          </div>
          <div>
            <Label htmlFor="camera-form-resolution" className={labelClass}>
              Resolução
            </Label>
            <select
              id="camera-form-resolution"
              value={form.resolution}
              onChange={(e) => set('resolution', e.target.value)}
              className={selectClass}
            >
              {RESOLUTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
              {!RESOLUTIONS.find((r) => r.value === form.resolution) && (
                <option value={form.resolution}>{form.resolution.replace('x', ' × ')}</option>
              )}
            </select>
          </div>
          <div>
            <Label htmlFor="camera-form-reconnect-interval" className={labelClass}>
              Intervalo de reconexão
            </Label>
            <Input
              id="camera-form-reconnect-interval"
              value={form.reconnect_interval}
              onChange={(e) => set('reconnect_interval', e.target.value)}
              placeholder="30s"
            />
            <p className="text-xs text-muted-foreground mt-0.5">
              ex: 10s, 1m, 5m — usado por gravação, transmissão e detecção de movimento
            </p>
          </div>
          {form.capture_type === 'rtsp' && (
            <div className="sm:col-span-2">
              <Label htmlFor="camera-motion-rtsp-url" className={labelClass}>
                RTSP URL da detecção de movimento (substream)
              </Label>
              <div className="flex gap-2">
                <Input
                  id="camera-motion-rtsp-url"
                  value={form.motion_rtsp_url}
                  onChange={(e) => set('motion_rtsp_url', e.target.value)}
                  placeholder="rtsp://usuario:senha@ip:554/stream (subtype=1)"
                />
                <Button
                  id="camera-motion-rtsp-detect"
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!form.rtsp_url.trim() || detecting}
                  onClick={handleDetectSubstream}
                  className="shrink-0"
                >
                  {detecting ? 'Detectando...' : 'Detectar'}
                </Button>
              </div>
              {detectMsg && (
                <p
                  className={`text-xs mt-0.5 ${detectMsg.ok ? 'text-green-500' : 'text-amber-500'}`}
                >
                  {detectMsg.text}
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-0.5">
                Opcional. Vazio = usa o stream principal. "Detectar" tenta descobrir o substream a
                partir da URL principal (menor resolução) — reduz muito o custo de CPU da detecção;
                o snapshot do evento sai nessa resolução. Usado pela sessão Detecção de movimento.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-surface border border-border rounded-lg overflow-hidden">
          <p className="text-h4 text-muted-foreground uppercase tracking-wider font-medium px-5 pt-4 pb-3 border-b border-border">
            Gravação
          </p>
          <div className="p-5">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                id="recording_enabled"
                checked={form.recording_enabled}
                onChange={(e) => set('recording_enabled', e.target.checked)}
                className="accent-primary"
              />
              <span className="text-xs text-muted-foreground">Gravar em disco</span>
            </label>
            {!form.recording_enabled && (
              <p className="text-xs text-muted-foreground mt-1">
                HLS e detecção de movimento continuam funcionando
              </p>
            )}
            {form.recording_enabled && (
              <div className="mt-3 flex flex-col gap-3">
                <div>
                  <Label htmlFor="camera-form-chunk-duration" className={labelClass}>
                    Duração do chunk
                  </Label>
                  <Input
                    id="camera-form-chunk-duration"
                    value={form.chunk_duration}
                    onChange={(e) => set('chunk_duration', e.target.value)}
                    placeholder="5m"
                  />
                  <p className="text-xs text-muted-foreground mt-0.5">ex: 30s, 5m, 1h</p>
                </div>
                <div>
                  <Label htmlFor="camera-form-record-video-mode" className={labelClass}>
                    Modo de gravação
                  </Label>
                  <select
                    id="camera-form-record-video-mode"
                    value={form.record_video_mode}
                    onChange={(e) => set('record_video_mode', e.target.value)}
                    className={selectClass}
                  >
                    <option value="auto">Auto (transcodifica HEVC → H.264)</option>
                    <option value="h264">H.264 (sempre transcodifica)</option>
                    <option value="copy">Cópia (sem transcodificação)</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="bg-surface border border-border rounded-lg overflow-hidden">
          <p className="text-h4 text-muted-foreground uppercase tracking-wider font-medium px-5 pt-4 pb-3 border-b border-border">
            Transmissão
          </p>
          <div className="p-5">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                id="camera-live-enabled"
                checked={form.live_enabled}
                onChange={(e) => set('live_enabled', e.target.checked)}
                className="accent-primary"
              />
              <span className="text-xs text-muted-foreground">Permitir transmissão ao vivo</span>
            </label>
            {!form.live_enabled && (
              <p className="text-xs text-muted-foreground mt-1">
                Gravação e detecção de movimento continuam funcionando
              </p>
            )}
            {form.live_enabled && (
              <div className="mt-3 flex flex-col gap-3">
                <div>
                  <Label htmlFor="camera-live-transport" className={labelClass}>
                    Transporte do ao-vivo
                  </Label>
                  <div className="flex gap-2">
                    <select
                      id="camera-live-transport"
                      value={form.live_transport}
                      onChange={(e) => set('live_transport', e.target.value)}
                      className={selectClass}
                    >
                      <option value="auto">
                        Automático — WebRTC com fallback HLS
                        {liveRecommended === 'webrtc' ? ' (recomendado)' : ''}
                      </option>
                      <option value="webrtc">
                        WebRTC — baixa latência
                        {liveRecommended === 'webrtc' ? ' (recomendado)' : ''}
                      </option>
                      <option value="hls">
                        HLS — compatível{liveRecommended === 'hls' ? ' (recomendado)' : ''}
                      </option>
                    </select>
                    <Button
                      id="camera-live-transport-detect"
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={!form.rtsp_url.trim() || detectingLive}
                      onClick={handleDetectStreams}
                      className="shrink-0"
                    >
                      {detectingLive ? 'Detectando...' : 'Detectar'}
                    </Button>
                  </div>
                  {liveDetectMsg && (
                    <p
                      className={`text-xs mt-0.5 ${liveDetectMsg.ok ? 'text-green-500' : 'text-amber-500'}`}
                    >
                      {liveDetectMsg.text}
                    </p>
                  )}
                  {form.live_transport === 'webrtc' && liveRecommended === 'hls' && (
                    <p className="text-xs text-amber-500 mt-0.5">
                      Este stream não é H.264 — o WebRTC cairá para HLS automaticamente.
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-0.5">
                    WebRTC entrega o ao-vivo com latência abaixo de 1s (exige H.264 no stream
                    principal). "Detectar" verifica o codec para recomendar o transporte.
                  </p>
                </div>

                <div>
                  <Label htmlFor="camera-form-hls-video-mode" className={labelClass}>
                    Modo de vídeo HLS
                  </Label>
                  <select
                    id="camera-form-hls-video-mode"
                    value={form.hls_video_mode}
                    onChange={(e) => set('hls_video_mode', e.target.value)}
                    className={selectClass}
                  >
                    <option value="auto">Auto (detecta via ffprobe)</option>
                    <option value="h264">H.264 (sempre transcodifica)</option>
                    <option value="copy">Cópia (sem transcodificação)</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="camera-form-hls-segment-seconds" className={labelClass}>
                    Duração do segmento (s)
                  </Label>
                  <select
                    id="camera-form-hls-segment-seconds"
                    value={form.hls_segment_seconds}
                    onChange={(e) => set('hls_segment_seconds', e.target.value)}
                    disabled={form.hls_segment_seconds_default}
                    className={`${selectClass} disabled:opacity-40 disabled:cursor-not-allowed`}
                  >
                    <option value="1">1 s</option>
                    <option value="2">2 s</option>
                    <option value="4">4 s</option>
                  </select>
                  <label className="flex items-center gap-1.5 mt-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.hls_segment_seconds_default}
                      onChange={(e) => set('hls_segment_seconds_default', e.target.checked)}
                      className="accent-primary"
                    />
                    <span className="text-xs text-faint">Usar padrão (2 s)</span>
                  </label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Cada segmento de vídeo ao vivo tem essa duração. Valores menores reduzem a
                    latência, mas aumentam o processamento.
                  </p>
                </div>

                <div>
                  <Label htmlFor="camera-form-hls-list-size" className={labelClass}>
                    Janela de reprodução (segmentos)
                  </Label>
                  <select
                    id="camera-form-hls-list-size"
                    value={form.hls_list_size}
                    onChange={(e) => set('hls_list_size', e.target.value)}
                    disabled={form.hls_list_size_default}
                    className={`${selectClass} disabled:opacity-40 disabled:cursor-not-allowed`}
                  >
                    <option value="2">2 segmentos</option>
                    <option value="3">3 segmentos</option>
                    <option value="5">5 segmentos</option>
                    <option value="10">10 segmentos</option>
                  </select>
                  <label className="flex items-center gap-1.5 mt-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.hls_list_size_default}
                      onChange={(e) => set('hls_list_size_default', e.target.checked)}
                      className="accent-primary"
                    />
                    <span className="text-xs text-faint">Usar padrão (5 segmentos)</span>
                  </label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Quantidade de segmentos mantidos na playlist ao vivo. A latência aproximada é
                    duração × janela (padrão ≈ 10 s).
                  </p>
                </div>

                <div>
                  <Label htmlFor="camera-form-hls-dvr-seconds" className={labelClass}>
                    Retenção DVR (s)
                  </Label>
                  <Input
                    id="camera-form-hls-dvr-seconds"
                    type="number"
                    min={0}
                    step={60}
                    value={form.hls_dvr_seconds}
                    onChange={(e) => set('hls_dvr_seconds', e.target.value)}
                    placeholder="0"
                  />
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Tempo máximo, em segundos, que o histórico ao vivo fica disponível para
                    consulta. Permite buscar eventos recentes sem gravação em disco.{' '}
                    <span className="text-muted-foreground">0 = desativado.</span>
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <Button id="camera-form-save" type="submit" size="sm" disabled={saving}>
          {saving ? 'Salvando...' : 'Salvar'}
        </Button>
        <Button
          id="camera-form-cancel"
          type="button"
          size="sm"
          variant="outline"
          onClick={onCancel}
        >
          Cancelar
        </Button>
      </div>
    </form>
  )
}
