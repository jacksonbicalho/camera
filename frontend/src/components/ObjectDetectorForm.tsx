import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export interface ObjectDetectorFormData {
  name: string
  config: {
    service_url: string
    model: string
  }
}

interface ObjectDetectorItem {
  id: number
  name: string
  config: Record<string, string>
}

interface ObjectDetectorFormProps {
  initial?: ObjectDetectorItem
  onSave: (data: ObjectDetectorFormData) => Promise<void>
  onCancel: () => void
  saving: boolean
}

// ObjectDetectorForm — campos hoje conhecidos (service_url/model); o limiar de
// confiança não é mais cadastrado aqui — é definido por câmera
// (CameraAnalysisSettingsPage) ou avulso na tela de teste (ObjectDetectorTestPage).
// O cadastro em si é chave/valor no backend (object_detector_config), então um
// campo novo no futuro não exige migration — só um novo input aqui.
export default function ObjectDetectorForm({
  initial,
  onSave,
  onCancel,
  saving,
}: ObjectDetectorFormProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [serviceUrl, setServiceUrl] = useState(initial?.config.service_url ?? '')
  const [model, setModel] = useState(initial?.config.model ?? 'yolov8n')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave({
      name,
      config: { service_url: serviceUrl, model },
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label
            htmlFor="object-detector-form-name"
            className="block text-xs text-muted-foreground mb-1"
          >
            Nome
          </Label>
          <Input
            id="object-detector-form-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div>
          <Label
            htmlFor="object-detector-form-service-url"
            className="block text-xs text-muted-foreground mb-1"
          >
            URL do serviço
          </Label>
          <Input
            id="object-detector-form-service-url"
            type="url"
            placeholder="http://yolo:8001"
            value={serviceUrl}
            onChange={(e) => setServiceUrl(e.target.value)}
            required
          />
        </div>
        <div>
          <Label
            htmlFor="object-detector-form-model"
            className="block text-xs text-muted-foreground mb-1"
          >
            Modelo
          </Label>
          <Input
            id="object-detector-form-model"
            placeholder="yolov8n"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            required
          />
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <Button id="object-detector-form-save" type="submit" size="sm" disabled={saving}>
          {saving ? 'Salvando...' : 'Salvar'}
        </Button>
        <Button
          id="object-detector-form-cancel"
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
