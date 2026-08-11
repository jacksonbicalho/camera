import { useEffect, useState } from 'react'
import ConfirmDialog from '../../components/ConfirmDialog'
import { authHeaders } from '../../auth'
import { Button } from '@/components/ui/button'

interface RetentionExtension {
  id: string
  name: string
  endpoint: string
  bucket: string
  region: string
  prefix: string
}

interface ExtensionState {
  available: boolean
  active: boolean
}

const emptyForm = () => ({
  name: '',
  endpoint: '',
  bucket: '',
  region: '',
  access_key: '',
  secret_key: '',
  prefix: '',
})

// S3ExtensionCard — conteúdo da extensão S3, renderizado dentro de
// PreferencesExtensionsPage (história refactor/preferencias-submenu-lateral-storage,
// T4 — antes era uma página própria, S3ExtensionConfigPage, removida quando o
// submenu deixou de ter sub-rota por extensão). Um único card (feedback do
// navigator vendo a branch real: dois cards separados pra Ativado/formulário
// não fazia sentido) — o formulário de destino só aparece quando "Ativado"
// está marcado (staged, local); "Aplicar" salva os dois juntos: primeiro a
// config do destino (POST se não existe linha em retention_extensions, PUT
// se já existe), depois o toggle `active` (PUT /api/settings/extensions/s3).
// Desmarcar e aplicar só desliga o toggle — não apaga a config salva (fica
// pronta pra reativar sem preencher tudo de novo); apagar de vez é
// "Excluir configuração", ação separada.
export default function S3ExtensionCard() {
  const [existing, setExisting] = useState<RetentionExtension | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [available, setAvailable] = useState(false)
  const [activeStaged, setActiveStaged] = useState(false)

  const loadRetentionExtension = () =>
    fetch('/api/retention-extensions', { headers: authHeaders() })
      .then((r) => r.json())
      .then((list: RetentionExtension[]) => {
        const re = list?.[0] ?? null
        setExisting(re)
        setForm(
          re
            ? {
                name: re.name,
                endpoint: re.endpoint,
                bucket: re.bucket,
                region: re.region,
                access_key: '',
                secret_key: '',
                prefix: re.prefix,
              }
            : emptyForm(),
        )
      })
      .catch(() => {})
      .finally(() => setLoaded(true))

  const loadActive = () =>
    fetch('/api/settings/extensions', { headers: authHeaders() })
      .then((r) => r.json())
      .then((list: ({ id: string } & ExtensionState)[]) => {
        const s3 = list?.find((e) => e.id === 's3')
        setAvailable(s3?.available ?? false)
        setActiveStaged(s3?.active ?? false)
      })
      .catch(() => {})

  useEffect(() => {
    loadRetentionExtension()
    loadActive()
  }, [])

  function applyActive() {
    return fetch('/api/settings/extensions/s3', {
      method: 'PUT',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: activeStaged }),
    })
  }

  function handleApply() {
    setSaving(true)
    if (!activeStaged) {
      // Desligando: não mexe na config salva, só desativa.
      applyActive()
        .catch(() => {})
        .finally(() => {
          setSaving(false)
          loadActive()
        })
      return
    }
    const method = existing ? 'PUT' : 'POST'
    const url = existing ? `/api/retention-extensions/${existing.id}` : '/api/retention-extensions'
    const body: Record<string, string> = {
      name: form.name,
      type: 's3',
      endpoint: form.endpoint,
      bucket: form.bucket,
      region: form.region,
      prefix: form.prefix,
    }
    if (form.access_key) body.access_key = form.access_key
    if (form.secret_key) body.secret_key = form.secret_key
    fetch(url, {
      method,
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then((res) => {
        if (res.ok) return applyActive()
      })
      .catch(() => {})
      .finally(() => {
        setSaving(false)
        loadRetentionExtension()
        loadActive()
      })
  }

  function handleDelete() {
    if (!existing) return
    fetch(`/api/retention-extensions/${existing.id}`, { method: 'DELETE', headers: authHeaders() })
      .then((res) => {
        if (res.ok) {
          loadRetentionExtension()
          loadActive()
        }
      })
      .catch(() => {})
      .finally(() => setConfirmDelete(false))
  }

  const fields: Array<{
    label: string
    field: keyof typeof form
    required?: boolean
    placeholder?: string
    password?: boolean
  }> = [
    { label: 'Nome', field: 'name', required: true },
    { label: 'Endpoint (opcional)', field: 'endpoint', placeholder: 'https://s3.amazonaws.com' },
    { label: 'Bucket', field: 'bucket', required: true },
    { label: 'Região', field: 'region', placeholder: 'us-east-1' },
    {
      label: 'Access Key',
      field: 'access_key',
      required: !existing,
      placeholder: existing ? '(manter atual)' : '',
    },
    {
      label: 'Secret Key',
      field: 'secret_key',
      required: !existing,
      placeholder: existing ? '(manter atual)' : '',
      password: true,
    },
    { label: 'Prefixo (opcional)', field: 'prefix' },
  ]

  if (!loaded) return <p className="text-sm text-muted-foreground">Carregando...</p>
  if (!available)
    return <p className="text-sm text-muted-foreground">Extensão não permitida nesta instância.</p>

  const invalidToActivate =
    activeStaged &&
    (!form.name || !form.bucket || (!existing && (!form.access_key || !form.secret_key)))

  return (
    <div id="s3-extension-card" className="bg-surface border border-border rounded-lg p-5 max-w-md">
      <p className="text-sm font-medium text-foreground mb-3">S3</p>
      <label className="flex items-center gap-2 cursor-pointer mb-4">
        <input
          type="checkbox"
          id="s3-active"
          checked={activeStaged}
          onChange={(e) => setActiveStaged(e.target.checked)}
          className="accent-primary"
        />
        <span className="text-sm text-foreground">Ativado</span>
      </label>

      {activeStaged && (
        <div className="space-y-3 mb-4">
          {fields.map(({ label, field, required, placeholder, password }) => (
            <div key={field}>
              <label
                htmlFor={`s3-config-${field}`}
                className="block text-xs text-muted-foreground mb-1"
              >
                {label}
                {required && <span className="text-red-400 ml-0.5">*</span>}
              </label>
              <input
                id={`s3-config-${field}`}
                type={password ? 'password' : 'text'}
                autoComplete={password ? 'new-password' : 'off'}
                className="w-full bg-surface-2 text-foreground text-sm rounded px-3 py-1.5 border border-border focus:outline-none focus:border-ring"
                value={form[field]}
                placeholder={placeholder}
                onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
              />
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-between gap-2">
        {existing ? (
          <Button
            id="s3-config-delete"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => setConfirmDelete(true)}
          >
            Excluir configuração
          </Button>
        ) : (
          <span />
        )}
        <Button id="s3-config-apply" onClick={handleApply} disabled={saving || invalidToActivate}>
          {saving ? 'Aplicando...' : 'Aplicar'}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Excluir configuração"
        message="Excluir a configuração do S3? Gravações que apontam pra ela como destino de retenção voltarão a ser apagadas."
        confirmLabel="Excluir"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
        danger
      />
    </div>
  )
}
