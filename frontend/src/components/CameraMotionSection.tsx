import { useState } from 'react'
import MotionScoreChart from './MotionScoreChart'
import { MotionTelegramNotify } from './CameraMotionTelegramNotify'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { authHeaders } from '../auth'
import { emptyForm, formToPayload, type Camera, type CameraFormData } from './cameraFormUtils'
import type { CameraSettings } from '../hooks/useSettings'

// CameraMotionSection — sessão "Detecção de movimento" de CameraDetailSettingsPage,
// migrada de CameraMotionSettingsPage.tsx (história feat/camera-form-reshape, T4) —
// "Detecção de movimento" deixou de ser aba/rota própria. Mantém seu próprio
// <form>/botão motion-save, independente das demais sessões da página (cada
// uma com seu próprio "Aplicar" — mesmo padrão generalizado na história
// refactor/camera-detail-secoes-aplicar).

function formatScore(v: number): string {
  if (v <= 0) return '—'
  if (v >= 1) return v.toFixed(2)
  const decimals = Math.max(2, -Math.floor(Math.log10(v)) + 1)
  return v.toFixed(decimals)
}

function ratioLabel(peak: number, threshold: number): React.ReactNode {
  if (peak === 0 || threshold === 0) return '—'
  const ratio = peak / threshold
  const ratioStr = `${formatScore(peak)} / ${formatScore(threshold)} = ${ratio.toFixed(2)}×`

  let hint: string
  if (ratio >= 1) {
    hint = 'Pico ultrapassou o limiar — eventos de movimento foram registrados hoje.'
  } else if (ratio >= 0.5) {
    hint =
      'Pico próximo ao limiar — considere reduzir o limiar para capturar este nível de movimento.'
  } else {
    hint = 'Pico bem abaixo do limiar — nenhum evento foi disparado hoje.'
  }

  return (
    <span>
      {ratioStr}
      <span className="block mt-1 text-xs text-muted-foreground font-sans">{hint}</span>
    </span>
  )
}

function RatioGuide({ peak, threshold }: { peak: number; threshold: number }) {
  const ratio = threshold > 0 ? peak / threshold : 0
  const zone: 'high' | 'mid' | 'low' = ratio >= 1 ? 'high' : ratio >= 0.5 ? 'mid' : 'low'

  const rows: Array<{
    id: 'high' | 'mid' | 'low'
    range: string
    color: string
    example: string
    suggestion: string
  }> = [
    {
      id: 'high',
      range: '≥ 1×',
      color: 'text-green-400',
      example: zone === 'high' ? `${ratio.toFixed(2)}×` : '1.50×',
      suggestion:
        zone === 'high'
          ? `Limiar ${formatScore(threshold)} funcionando. Se houver falsos positivos, aumente para ~${formatScore(threshold * 2)}.`
          : 'Pico ultrapassou o limiar — eventos registrados. Aumente o limiar se houver falsos positivos.',
    },
    {
      id: 'mid',
      range: '0.5× – 1×',
      color: 'text-yellow-400',
      example: zone === 'mid' ? `${ratio.toFixed(2)}×` : '0.75×',
      suggestion:
        zone === 'mid'
          ? `Pico (${formatScore(peak)}) próximo ao limiar (${formatScore(threshold)}). Reduza para ~${formatScore(peak * 0.8)} para capturar este movimento.`
          : 'Próximo ao limiar. Reduza o limiar para capturar este nível de movimento.',
    },
    {
      id: 'low',
      range: '< 0.5×',
      color: 'text-muted-foreground',
      example: zone === 'low' ? `${ratio.toFixed(2)}×` : '0.41×',
      suggestion:
        zone === 'low'
          ? `Pico (${formatScore(peak)}) bem abaixo do limiar (${formatScore(threshold)}). Para detectar este nível, reduza para ~${formatScore(peak * 1.5)}.`
          : 'Bem abaixo do limiar — nenhum evento disparado.',
    },
  ]

  return (
    <div className="bg-surface border border-border rounded-lg px-5 py-4">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
        Como interpretar a relação
      </p>
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left text-muted-foreground font-medium pb-2 pr-4">Situação</th>
            <th className="text-left text-muted-foreground font-medium pb-2 pr-4">Hoje</th>
            <th className="text-left text-muted-foreground font-medium pb-2">Sugestão</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => {
            const active = row.id === zone
            return (
              <tr key={row.id} className={active ? 'bg-surface-2/50' : 'opacity-40'}>
                <td className={`py-2 pr-4 font-mono whitespace-nowrap ${row.color}`}>
                  {row.range}
                </td>
                <td
                  className={`py-2 pr-4 font-mono whitespace-nowrap ${active ? 'text-white' : 'text-muted-foreground'}`}
                >
                  {row.example}
                </td>
                <td className={`py-2 ${active ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {row.suggestion}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// MotionPanel — painel/título "Detecção de movimento", mesmo padrão visual das
// sessões de CameraForm (bg-surface/border/rounded-lg + título text-h4). Vive
// aqui (não no chamador) pra MotionReadOnly/MotionFormContent nunca duplicarem
// título — cada um já nasce com o painel embutido, o chamador só invoca o
// componente direto, sem embrulhar de novo.
function MotionPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden">
      <p className="text-h4 text-muted-foreground uppercase tracking-wider font-medium px-5 pt-4 pb-3 border-b border-border">
        Detecção de movimento
      </p>
      <div className="p-5">{children}</div>
    </div>
  )
}

// FieldGroup — sub-bloco de campos label/valor DENTRO de um MotionPanel já
// existente (sem Card/borda própria — SettingsSection aninhado aqui criava
// painel-dentro-de-painel, feedback do navigator vendo a página real).
function FieldGroup({
  title,
  fields,
}: {
  title: string
  fields: { label: string; value: React.ReactNode }[]
}) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
        {title}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {fields.map(({ label, value }) => (
          <div key={label}>
            <p className="text-xs text-muted-foreground mb-1">{label}</p>
            <p className="text-sm font-mono text-foreground break-all">{value ?? '—'}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

export function MotionReadOnly({
  cam,
  id,
  peak,
}: {
  cam: CameraSettings | null
  id: string
  peak: { peak_raw_score: number } | null
}) {
  if (!cam) {
    return (
      <MotionPanel>
        <p className="text-muted-foreground text-sm">Câmera não encontrada.</p>
      </MotionPanel>
    )
  }
  const motion = cam.motion
  if (!motion?.enabled) {
    return (
      <MotionPanel>
        <p className="text-xs text-muted-foreground">Desabilitado</p>
      </MotionPanel>
    )
  }
  return (
    <MotionPanel>
      <div className="flex flex-col gap-4">
        <FieldGroup
          title="Configuração"
          fields={[
            { label: 'Status', value: 'Habilitado' },
            { label: 'Limiar', value: formatScore(motion.threshold) },
            { label: 'FPS de análise', value: String(motion.fps) },
            { label: 'Cooldown (s)', value: String(motion.cooldown_seconds) },
          ]}
        />
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Score em tempo real
          </p>
          <MotionScoreChart cameraId={id} threshold={motion.threshold} />
        </div>
        {peak !== null && (
          <FieldGroup
            title="Hoje"
            fields={[
              { label: 'Pico de score bruto', value: formatScore(peak.peak_raw_score) },
              { label: 'Limiar configurado', value: formatScore(motion.threshold) },
            ]}
          />
        )}
        <MotionTelegramNotify cameraId={id} motionEnabled={motion.enabled} />
      </div>
    </MotionPanel>
  )
}

const inputClass =
  'w-full bg-surface-2 border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:border-ring'
const labelClass = 'block text-xs text-muted-foreground mb-1'

interface MotionFormContentProps {
  cam: Camera
  id: string
  peak: { peak_raw_score: number } | null
  reload: () => void
}

export function MotionFormContent({ cam, id, peak, reload }: MotionFormContentProps) {
  const [form, setForm] = useState<CameraFormData>(() => emptyForm(cam))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [saveCount, setSaveCount] = useState(0)
  const [detecting, setDetecting] = useState(false)
  const [detectMsg, setDetectMsg] = useState<{ text: string; ok: boolean } | null>(null)

  const set = (field: keyof CameraFormData, value: string | boolean | number) =>
    setForm((prev) => ({ ...prev, [field]: value }))

  const handleDetectSubstream = async () => {
    // Usa cam.rtsp_url (dado atual), não form.rtsp_url — form é um snapshot da
    // montagem e não é atualizado se a URL principal mudar na sessão Captura
    // sem remontar esta seção (mesma razão do payload de handleSave abaixo).
    const main = cam.rtsp_url.trim()
    if (!main) return
    setDetecting(true)
    setDetectMsg(null)
    try {
      const res = await fetch('/api/settings/cameras/detect-substream', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ rtsp_url: main, id: cam.id }),
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

  const effectiveThreshold = parseFloat(form.motion_threshold) || 0
  const streamW = cam.width ?? 0
  const streamH = cam.height ?? 0
  const previewW = form.motion_capture_auto
    ? streamW > 0
      ? Math.round(streamW / 4)
      : null
    : streamW > 0
      ? Math.round((streamW * form.motion_capture_pct) / 100)
      : null
  const previewH = form.motion_capture_auto
    ? streamH > 0
      ? Math.round(streamH / 4)
      : null
    : streamH > 0
      ? Math.round((streamH * form.motion_capture_pct) / 100)
      : null

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      // MotionFormContent fica montado o tempo todo (não é remontado ao entrar/sair
      // de edição da câmera, como CameraForm é) — `form` nasceu de um snapshot de
      // `cam` que pode estar desatualizado se o usuário editou e salvou outra sessão
      // (Nome/Captura/Gravação/Transmissão) nesse meio tempo sem sair da página.
      // Por isso o payload NUNCA usa `form` inteiro: parte de `emptyForm(cam)` (dados
      // atuais de verdade) e sobrepõe só os campos que esta sessão de fato edita —
      // salvar aqui nunca reverte silenciosamente uma edição feita em outra sessão.
      // motion_rtsp_url só se aplica a capture_type=rtsp (é a URL alternativa
      // que o motion lê); se outra sessão trocou capture_type pra hls nesse
      // meio-tempo, o campo fica escondido na UI mas não deve persistir um
      // valor morto — usa o form só quando ainda faz sentido.
      const captureType = cam.capture_type ?? 'rtsp'
      const payload = {
        ...emptyForm(cam),
        motion_rtsp_url: captureType === 'rtsp' ? form.motion_rtsp_url : '',
        motion_enabled: form.motion_enabled,
        motion_threshold: form.motion_threshold,
        motion_fps: form.motion_fps,
        motion_cooldown: form.motion_cooldown,
        motion_capture_auto: form.motion_capture_auto,
        motion_capture_pct: form.motion_capture_pct,
        motion_playback_lead: form.motion_playback_lead,
        motion_playback_trail: form.motion_playback_trail,
      }
      const res = await fetch(`/api/settings/cameras/${id}`, {
        method: 'PUT',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(formToPayload(payload)),
      })
      if (!res.ok) {
        setError((await res.text()).trim() || 'Erro ao salvar')
        return
      }
      setSaved(true)
      setSaveCount((c) => c + 1)
      reload()
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  return (
    <MotionPanel>
      <form onSubmit={handleSave} className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="motion_enabled"
            checked={form.motion_enabled}
            onChange={(e) => set('motion_enabled', e.target.checked)}
            className="accent-primary"
          />
          <label htmlFor="motion_enabled" className="text-xs text-muted-foreground cursor-pointer">
            Habilitado
          </label>
        </div>

        {form.motion_enabled && (
          <>
            {(cam.capture_type ?? 'rtsp') === 'rtsp' && (
              <div>
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
                    disabled={!cam.rtsp_url.trim() || detecting}
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
                  partir da URL principal (menor resolução) — reduz muito o custo de CPU da
                  detecção; o snapshot do evento sai nessa resolução.
                </p>
              </div>
            )}

            <div>
              <p className="text-xs font-medium text-muted-foreground mb-3">Score em tempo real</p>
              <MotionScoreChart key={saveCount} cameraId={id} threshold={effectiveThreshold} />
            </div>

            {peak !== null && (
              <>
                <FieldGroup
                  title="Hoje"
                  fields={[
                    { label: 'Pico de score bruto', value: formatScore(peak.peak_raw_score) },
                    { label: 'Limiar configurado', value: String(effectiveThreshold) },
                    {
                      label: 'Relação pico / limiar',
                      value: ratioLabel(peak.peak_raw_score, effectiveThreshold),
                    },
                  ]}
                />
                <RatioGuide peak={peak.peak_raw_score} threshold={effectiveThreshold} />
              </>
            )}

            <div className="flex flex-col gap-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Configuração
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Limiar</label>
                  <input
                    type="number"
                    step="0.001"
                    min="0.001"
                    max="1"
                    value={form.motion_threshold}
                    onChange={(e) => set('motion_threshold', e.target.value)}
                    className={inputClass}
                  />
                  <p className="text-xs text-muted-foreground mt-0.5">
                    0.001 – 1.0 · quanto menor, mais sensível
                  </p>
                </div>
                <div>
                  <label className={labelClass}>FPS de análise</label>
                  <input
                    type="number"
                    min="1"
                    max="30"
                    value={form.motion_fps}
                    onChange={(e) => set('motion_fps', e.target.value)}
                    className={inputClass}
                  />
                  <p className="text-xs text-muted-foreground mt-0.5">1 – 30 fps · padrão: 2</p>
                </div>
                <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className={labelClass}>Cooldown (segundos)</label>
                    <input
                      type="number"
                      min="0"
                      value={form.motion_cooldown}
                      onChange={(e) => set('motion_cooldown', e.target.value)}
                      className={inputClass}
                    />
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Tempo mínimo entre eventos · 0 = sem cooldown
                    </p>
                  </div>
                  <div>
                    <label className={labelClass}>Segundos antes do evento</label>
                    <input
                      type="number"
                      min="0"
                      max="300"
                      value={form.motion_playback_lead}
                      onChange={(e) => set('motion_playback_lead', e.target.value)}
                      className={inputClass}
                    />
                    <p className="text-xs text-muted-foreground mt-0.5">
                      0 – 300 s · recua o player antes do instante detectado
                    </p>
                  </div>
                  <div>
                    <label className={labelClass}>Segundos após o evento</label>
                    <input
                      type="number"
                      min="0"
                      max="300"
                      value={form.motion_playback_trail}
                      onChange={(e) => set('motion_playback_trail', e.target.value)}
                      className={inputClass}
                    />
                    <p className="text-xs text-muted-foreground mt-0.5">
                      0 – 300 s · preserva chunks gravados após o evento
                    </p>
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>Resolução de análise</label>
                  <div className="flex items-center gap-2 mb-2">
                    <input
                      type="checkbox"
                      id="motion_capture_auto"
                      checked={form.motion_capture_auto}
                      onChange={(e) => set('motion_capture_auto', e.target.checked)}
                      className="accent-primary"
                    />
                    <label
                      htmlFor="motion_capture_auto"
                      className="text-xs text-muted-foreground cursor-pointer"
                    >
                      Automático (stream ÷ 4
                      {previewW !== null ? ` → ${previewW} × ${previewH} px` : ''})
                    </label>
                  </div>
                  {!form.motion_capture_auto && (
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min={5}
                          max={100}
                          step={5}
                          value={form.motion_capture_pct}
                          onChange={(e) => set('motion_capture_pct', parseInt(e.target.value))}
                          className="flex-1 accent-primary"
                        />
                        <span className="text-xs text-foreground font-mono w-10 text-right">
                          {form.motion_capture_pct}%
                        </span>
                      </div>
                      {previewW !== null ? (
                        <p className="text-xs text-muted-foreground">
                          → {previewW} × {previewH} px
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Configure largura e altura do stream para ver a resolução em pixels
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {error && (
          <div className="px-3 py-2 bg-red-900/30 border border-red-700/50 rounded text-xs text-red-400">
            {error}
          </div>
        )}

        <div className="flex items-center gap-3">
          <Button id="motion-save" type="submit" size="sm" disabled={saving}>
            {saving ? 'Aplicando...' : 'Aplicar'}
          </Button>
          {saved && <span className="text-xs text-green-400">Salvo</span>}
        </div>
      </form>
      <MotionTelegramNotify cameraId={id} motionEnabled={cam.motion?.enabled ?? false} />
    </MotionPanel>
  )
}
