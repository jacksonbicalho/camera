import { useEffect, useState } from 'react'
import { authHeaders } from '../../auth'
import { ApplyButton } from '@/components/ui/apply-button'
import { CircleUser, Check } from '@/components/Icons'
import ExtensionCard from '@/components/ExtensionCard'
import ExtensionActiveToggle from '@/components/ExtensionActiveToggle'

interface Extension {
  id: string
  name: string
  description: string
  available: boolean
  active: boolean
}

// FaceDetectorCard — conteúdo da extensão Face Detector, renderizado dentro
// de PreferencesExtensionsPage (história feat/extensao-face-detector).
// Esqueleto liga/desliga — cópia estrutural de TelegramExtensionCard.tsx
// (o card mais simples que existe: só ExtensionCard/ExtensionActiveToggle/
// ApplyButton, sem formulário extra). Nenhuma lógica de detecção facial
// de verdade ainda — isso é escopo de uma história futura. Ícone CircleUser
// (components/Icons.tsx) dentro de círculo bg-primary, mesmo critério do
// HardDrive em S3ExtensionCard.tsx: sem asset de marca própria pra "Face
// Detector" (feature própria, não integração de terceiro), então ícone
// genérico em vez de inventar um path SVG novo.
export default function FaceDetectorCard() {
  const [ext, setExt] = useState<Extension | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [activeStaged, setActiveStaged] = useState(false)
  const [savedActive, setSavedActive] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/settings/extensions', { headers: authHeaders() })
      .then((r) => r.json())
      .then((list: Extension[]) => {
        const found = list?.find((e) => e.id === 'face-detector') ?? null
        setExt(found)
        setActiveStaged(found?.active ?? false)
        setSavedActive(found?.active ?? false)
      })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  function handleApply() {
    setSaving(true)
    fetch('/api/settings/extensions/face-detector', {
      method: 'PUT',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: activeStaged }),
    })
      .then((r) => {
        if (r.ok) setSavedActive(activeStaged)
      })
      .catch(() => {})
      .finally(() => setSaving(false))
  }

  if (!loaded) return <p className="text-sm text-muted-foreground">Carregando...</p>
  if (!ext) return <p className="text-sm text-muted-foreground">Extensão não encontrada.</p>

  return (
    <ExtensionCard
      id="face-detector-extension-card"
      icon={
        <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-primary">
          <CircleUser className="h-8 w-8 text-on-primary" />
        </div>
      }
      name={ext.name}
      description={ext.description}
      available={ext.available}
    >
      <ExtensionActiveToggle
        id="face-detector-active"
        checked={activeStaged}
        onChange={setActiveStaged}
        savedActive={savedActive}
        description="Detecta rostos nas gravações desta instância."
      />
      <div className="flex justify-end">
        <ApplyButton
          id="face-detector-apply"
          saving={saving}
          disabled={activeStaged === savedActive}
          size="default"
          type="button"
          onClick={handleApply}
          icon={<Check className="h-4 w-4" />}
        />
      </div>
    </ExtensionCard>
  )
}
