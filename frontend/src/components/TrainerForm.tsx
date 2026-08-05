import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export type TrainerType = 'yolo'

export interface TrainerFormData {
  name: string
  type: TrainerType
  config: Record<string, string>
}

interface TrainerItem {
  id: number
  name: string
  type?: TrainerType
  config: Record<string, string>
}

interface TrainerFormProps {
  initial?: TrainerItem
  onSave: (data: TrainerFormData) => Promise<void>
  onCancel: () => void
  saving: boolean
}

// TrainerForm — mirror de ObjectDetectorForm (component/ObjectDetectorForm.tsx),
// mas com um único tipo implementado por enquanto (yolo). O `<select>` de tipo
// já existe (uma opção só) pra o form nascer preparado pra crescer sem
// remodelar quando um 2º backend de treino aparecer.
export default function TrainerForm({ initial, onSave, onCancel, saving }: TrainerFormProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [type] = useState<TrainerType>('yolo')
  const [serviceUrl, setServiceUrl] = useState(initial?.config.service_url ?? '')
  const [model, setModel] = useState(initial?.config.model ?? 'yolov8n')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave({ name, type, config: { service_url: serviceUrl, model } })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label htmlFor="trainer-form-name" className="block text-xs text-muted-foreground mb-1">
            Nome
          </Label>
          <Input
            id="trainer-form-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="trainer-form-type" className="block text-xs text-muted-foreground mb-1">
            Tipo
          </Label>
          <select
            id="trainer-form-type"
            value={type}
            disabled
            className="w-full bg-background border border-border rounded px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary"
          >
            <option value="yolo">YOLO</option>
          </select>
        </div>
        <div>
          <Label
            htmlFor="trainer-form-service-url"
            className="block text-xs text-muted-foreground mb-1"
          >
            URL do serviço
          </Label>
          <Input
            id="trainer-form-service-url"
            type="url"
            placeholder="http://yolo:8001"
            value={serviceUrl}
            onChange={(e) => setServiceUrl(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="trainer-form-model" className="block text-xs text-muted-foreground mb-1">
            Modelo
          </Label>
          <Input
            id="trainer-form-model"
            placeholder="yolov8n"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            required
          />
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <Button id="trainer-form-save" type="submit" size="sm" disabled={saving}>
          {saving ? 'Salvando...' : 'Salvar'}
        </Button>
        <Button
          id="trainer-form-cancel"
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
