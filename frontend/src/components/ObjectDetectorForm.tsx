import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export type ObjectDetectorType = 'yolo' | 'huggingface'

export interface ObjectDetectorFormData {
  name: string
  type: ObjectDetectorType
  config: Record<string, string>
}

interface ObjectDetectorItem {
  id: number
  name: string
  type?: ObjectDetectorType
  config: Record<string, string>
}

interface ObjectDetectorFormProps {
  initial?: ObjectDetectorItem
  onSave: (data: ObjectDetectorFormData) => Promise<void>
  onCancel: () => void
  saving: boolean
}

// ObjectDetectorForm — a primeira escolha é o tipo (yolo/hugging face); cada
// tipo expõe seus próprios campos de config. O cadastro em si é chave/valor
// no backend (object_detector_config), então um campo novo no futuro não
// exige migration — só um novo input aqui.
export default function ObjectDetectorForm({
  initial,
  onSave,
  onCancel,
  saving,
}: ObjectDetectorFormProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [type, setType] = useState<ObjectDetectorType>(initial?.type ?? 'yolo')
  const [serviceUrl, setServiceUrl] = useState(initial?.config.service_url ?? '')
  const [model, setModel] = useState(initial?.config.model ?? 'yolov8n')
  const [confidenceThreshold, setConfidenceThreshold] = useState(
    initial?.config.confidence_threshold ?? '0.4',
  )
  const [modelId, setModelId] = useState(initial?.config.model_id ?? '')
  const [apiToken, setApiToken] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const config: Record<string, string> =
      type === 'huggingface'
        ? { model_id: modelId, api_token: apiToken }
        : { service_url: serviceUrl, model, confidence_threshold: confidenceThreshold }
    onSave({ name, type, config })
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
            htmlFor="object-detector-form-type"
            className="block text-xs text-muted-foreground mb-1"
          >
            Tipo
          </Label>
          <select
            id="object-detector-form-type"
            value={type}
            onChange={(e) => setType(e.target.value as ObjectDetectorType)}
            className="w-full bg-background border border-border rounded px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary"
          >
            <option value="yolo">YOLO</option>
            <option value="huggingface">Hugging Face</option>
          </select>
        </div>
        {type === 'yolo' && (
          <>
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
            <div>
              <Label
                htmlFor="object-detector-form-confidence"
                className="block text-xs text-muted-foreground mb-1"
              >
                Limiar de confiança
              </Label>
              <Input
                id="object-detector-form-confidence"
                type="number"
                min={0.1}
                max={0.9}
                step={0.05}
                value={confidenceThreshold}
                onChange={(e) => setConfidenceThreshold(e.target.value)}
              />
            </div>
          </>
        )}
        {type === 'huggingface' && (
          <>
            <div>
              <Label
                htmlFor="object-detector-form-model-id"
                className="block text-xs text-muted-foreground mb-1"
              >
                Model ID
              </Label>
              <Input
                id="object-detector-form-model-id"
                placeholder="facebook/detr-resnet-50"
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                required
              />
            </div>
            <div>
              <Label
                htmlFor="object-detector-form-api-token"
                className="block text-xs text-muted-foreground mb-1"
              >
                API Token
              </Label>
              <Input
                id="object-detector-form-api-token"
                type="password"
                placeholder={initial ? 'Deixe em branco para manter a atual' : 'hf_...'}
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                required={!initial}
              />
            </div>
          </>
        )}
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
