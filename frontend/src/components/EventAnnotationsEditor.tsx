import { useEffect, useState } from 'react'
import BboxCanvas, { type BboxRect } from './BboxCanvas'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { authHeaders } from '../auth'

export interface EventAnnotation {
  id: number
  label: string
  bbox_x: number
  bbox_y: number
  bbox_w: number
  bbox_h: number
  rotation_deg?: number
}

interface EventAnnotationsEditorProps {
  eventId: number
  imageSrc: string
  // Chamado após salvar (criar ou editar) uma anotação com sucesso, com o
  // label salvo — permite ao chamador sincronizar o label do PRÓPRIO evento
  // de movimento (motion_events.label), mesmo comportamento que existia no
  // editor singular anterior (o label da anotação "vencia" o label do
  // evento). Opcional: sem consumidor, o editor funciona normalmente, só
  // sem essa sincronização.
  onAnnotationSaved?: (label: string) => void
}

function toBboxRect(a: EventAnnotation): BboxRect {
  return {
    x: a.bbox_x - a.bbox_w / 2,
    y: a.bbox_y - a.bbox_h / 2,
    w: a.bbox_w,
    h: a.bbox_h,
    rotation_deg: a.rotation_deg ?? 0,
  }
}

// EventAnnotationsEditor — lista TODAS as anotações do evento (não só a
// primeira) e permite adicionar/editar/remover cada uma individualmente,
// sem afetar as demais. As já salvas ficam sobrepostas na imagem como
// overlay estático (retângulo + label, só leitura — mesmo efeito do
// exemplo clássico de detecção com várias classes visíveis ao mesmo tempo);
// só a anotação em desenho/edição usa o BboxCanvas interativo por vez.
export default function EventAnnotationsEditor({
  eventId,
  imageSrc,
  onAnnotationSaved,
}: EventAnnotationsEditorProps) {
  const [annotations, setAnnotations] = useState<EventAnnotation[]>([])
  const [loading, setLoading] = useState(true)
  const [drafting, setDrafting] = useState(false)
  const [draftBox, setDraftBox] = useState<BboxRect | null>(null)
  const [draftLabel, setDraftLabel] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch(`/api/events/${eventId}/annotations`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : []))
      .then((list: EventAnnotation[]) => setAnnotations(list))
      .catch(() => setAnnotations([]))
      .finally(() => setLoading(false))
  }, [eventId])

  function startNew() {
    setEditingId(null)
    setDraftBox(null)
    setDraftLabel('')
    setDrafting(true)
  }

  function startEdit(a: EventAnnotation) {
    setEditingId(a.id)
    setDraftBox(toBboxRect(a))
    setDraftLabel(a.label)
    setDrafting(true)
  }

  function cancelDraft() {
    setDrafting(false)
    setDraftBox(null)
    setDraftLabel('')
    setEditingId(null)
  }

  async function saveDraft() {
    if (!draftBox || draftBox.w < 0.01 || draftBox.h < 0.01) return
    setSaving(true)
    try {
      const payload = {
        label: draftLabel,
        bbox_x: draftBox.x + draftBox.w / 2,
        bbox_y: draftBox.y + draftBox.h / 2,
        bbox_w: draftBox.w,
        bbox_h: draftBox.h,
        rotation_deg: draftBox.rotation_deg ?? 0,
      }
      if (editingId !== null) {
        const res = await fetch(`/api/annotations/${editingId}`, {
          method: 'PATCH',
          headers: { ...authHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (res.ok) {
          setAnnotations((prev) => prev.map((a) => (a.id === editingId ? { ...a, ...payload } : a)))
          onAnnotationSaved?.(draftLabel)
          cancelDraft()
        }
      } else {
        const res = await fetch(`/api/events/${eventId}/annotations`, {
          method: 'POST',
          headers: { ...authHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (res.ok) {
          const data = await res.json()
          setAnnotations((prev) => [...prev, { id: data.id, ...payload }])
          onAnnotationSaved?.(draftLabel)
          cancelDraft()
        }
      }
    } finally {
      setSaving(false)
    }
  }

  async function removeAnnotation(id: number) {
    const res = await fetch(`/api/annotations/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    })
    if (res.ok) {
      setAnnotations((prev) => prev.filter((a) => a.id !== id))
      if (editingId === id) cancelDraft()
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <img src={imageSrc} className="block w-full h-auto" alt="" draggable={false} />
        {!drafting &&
          annotations.map((a) => (
            <div
              key={a.id}
              className="absolute border-2 border-emerald-400 pointer-events-none"
              style={{
                left: `${(a.bbox_x - a.bbox_w / 2) * 100}%`,
                top: `${(a.bbox_y - a.bbox_h / 2) * 100}%`,
                width: `${a.bbox_w * 100}%`,
                height: `${a.bbox_h * 100}%`,
              }}
            >
              <span className="absolute -top-5 left-0 text-xs bg-emerald-600 text-white px-1 rounded whitespace-nowrap">
                {a.label}
              </span>
            </div>
          ))}
        {drafting && (
          <BboxCanvas
            box={draftBox}
            onChange={setDraftBox}
            deletable={false}
            className="absolute inset-0 w-full h-full select-none"
          />
        )}
      </div>

      {drafting ? (
        <div className="flex items-center gap-2">
          <Label htmlFor="event-annotation-label-input" className="sr-only">
            Label da anotação
          </Label>
          <Input
            id="event-annotation-label-input"
            placeholder="label da anotação…"
            value={draftLabel}
            onChange={(e) => setDraftLabel(e.target.value)}
            autoFocus
          />
          <Button size="sm" onClick={saveDraft} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar anotação'}
          </Button>
          <Button size="sm" variant="outline" onClick={cancelDraft}>
            Cancelar
          </Button>
        </div>
      ) : (
        <Button id="event-annotations-new" type="button" size="sm" onClick={startNew}>
          Nova anotação
        </Button>
      )}

      <ul id="event-annotations-list" className="flex flex-col gap-1">
        {loading && <li className="text-xs text-muted-foreground">Carregando…</li>}
        {!loading &&
          annotations.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-foreground">{a.label}</span>
              <span className="flex gap-1 shrink-0">
                <Button size="sm" variant="outline" onClick={() => startEdit(a)}>
                  Editar
                </Button>
                <Button size="sm" variant="outline" onClick={() => removeAnnotation(a.id)}>
                  Remover
                </Button>
              </span>
            </li>
          ))}
      </ul>
    </div>
  )
}
