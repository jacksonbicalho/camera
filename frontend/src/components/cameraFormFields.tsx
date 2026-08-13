import { type CameraFormData, RESOLUTIONS } from './cameraFormUtils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// cameraFormFields — blocos de campos extraídos de CameraForm.tsx (história
// refactor/camera-detail-secoes-aplicar, T1), presentacionais puros (sem
// estado próprio), reusados tanto pelo form único de criação (CameraForm.tsx,
// `/settings/cameras/new`) quanto pelas seções independentes de edição
// (CameraCaptureSection/CameraRecordingSection/CameraTransmissionSection).
// `CaptureFields.codecDisabled` e `TransmissionFields.rtspUrl` são passados
// pelo chamador em vez de lidos direto do form — na criação vêm do mesmo
// form; na edição, `codecDisabled` vem de `cam.live_transport` (persistido,
// não de outra seção em edição) e `rtspUrl` vem de `cam.rtsp_url` fresco
// (mesmo motivo de `MotionFormContent.handleDetectSubstream` já usar
// `cam.rtsp_url` em vez de um form local potencialmente desatualizado).

export interface FieldsProps {
  form: CameraFormData
  set: (field: keyof CameraFormData, value: string | boolean | number) => void
}

const selectClass =
  'w-full bg-background border border-border rounded px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary'
const labelClass = 'block text-xs text-muted-foreground mb-1'

export function NameField({ form, set }: FieldsProps) {
  return (
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
  )
}

export function CaptureFields({
  form,
  set,
  codecDisabled,
}: FieldsProps & { codecDisabled: boolean }) {
  const codecValue = codecDisabled ? 'h264' : form.video_codec
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
          value={codecValue}
          onChange={(e) => set('video_codec', e.target.value)}
          disabled={codecDisabled}
          className={`${selectClass} disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          <option value="">Auto (ffprobe detecta)</option>
          <option value="h264">H.264 / AVC</option>
          <option value="hevc">HEVC / H.265</option>
          <option value="mjpeg">MJPEG</option>
          <option value="mpeg4">MPEG-4</option>
        </select>
        {codecDisabled && (
          <p className="text-xs text-muted-foreground mt-0.5">
            Forçado para H.264 — exigido pelo transporte WebRTC selecionado em Transmissão.
          </p>
        )}
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
    </div>
  )
}

export function RecordingFields({ form, set }: FieldsProps) {
  return (
    <div>
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
  )
}

export function TransmissionFields({
  form,
  set,
  rtspUrl,
  detecting,
  detectMsg,
  liveRecommended,
  onDetect,
  onTransportChange,
}: FieldsProps & {
  rtspUrl: string
  detecting: boolean
  detectMsg: { text: string; ok: boolean } | null
  liveRecommended: string
  onDetect: () => void
  onTransportChange: (value: string) => void
}) {
  return (
    <div>
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
                onChange={(e) => onTransportChange(e.target.value)}
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
                disabled={!rtspUrl.trim() || detecting}
                onClick={onDetect}
                className="shrink-0"
              >
                {detecting ? 'Detectando...' : 'Detectar'}
              </Button>
            </div>
            {detectMsg && (
              <p className={`text-xs mt-0.5 ${detectMsg.ok ? 'text-green-500' : 'text-amber-500'}`}>
                {detectMsg.text}
              </p>
            )}
            {form.live_transport === 'webrtc' && liveRecommended === 'hls' && (
              <p className="text-xs text-amber-500 mt-0.5">
                O codec detectado no stream real não é H.264 — o WebRTC não vai funcionar (o HLS foi
                desligado ao selecionar este transporte, sem fallback automático). Troque para
                "Automático" ou "HLS".
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-0.5">
              WebRTC entrega o ao-vivo com latência abaixo de 1s (exige H.264 no stream principal).
              "Detectar" verifica o codec para recomendar o transporte.
            </p>
          </div>

          {form.live_transport !== 'webrtc' && (
            <>
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
                  Tempo máximo, em segundos, que o histórico ao vivo fica disponível para consulta.
                  Permite buscar eventos recentes sem gravação em disco.{' '}
                  <span className="text-muted-foreground">0 = desativado.</span>
                </p>
              </div>
            </>
          )}
          {form.live_transport === 'webrtc' && (
            <p className="text-xs text-muted-foreground">
              HLS desligado — WebRTC com H.264 não usa segmentos/janela/DVR.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
