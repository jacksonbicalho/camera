import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import SettingsLayout from '../../components/SettingsLayout'
import PageHeader from '../../components/PageHeader'
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

const emptyForm = () => ({
  name: '',
  endpoint: '',
  bucket: '',
  region: '',
  access_key: '',
  secret_key: '',
  prefix: '',
})

// S3ExtensionConfigPage — tela "Configurar" da extensão S3 (história
// feat/extensoes-generalizadas-s3-extensao, T4). S3 é singleton: no máximo 1
// linha em retention_extensions — esta página cria (POST) quando não existe
// nenhuma, ou edita (PUT) a existente, reaproveitando o mesmo conjunto de
// campos que vivia no antigo modal de "+ Adicionar drive" de
// StorageSettingsPage.tsx.
export default function S3ExtensionConfigPage() {
  const navigate = useNavigate()
  const [existing, setExisting] = useState<RetentionExtension | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    fetch('/api/retention-extensions', { headers: authHeaders() })
      .then((r) => r.json())
      .then((list: RetentionExtension[]) => {
        const re = list?.[0] ?? null
        setExisting(re)
        if (re) {
          setForm({
            name: re.name,
            endpoint: re.endpoint,
            bucket: re.bucket,
            region: re.region,
            access_key: '',
            secret_key: '',
            prefix: re.prefix,
          })
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  function handleApply() {
    setSaving(true)
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
        if (res.ok) navigate('/settings/preferences/extensions')
      })
      .catch(() => {})
      .finally(() => setSaving(false))
  }

  function handleDelete() {
    if (!existing) return
    fetch(`/api/retention-extensions/${existing.id}`, { method: 'DELETE', headers: authHeaders() })
      .then((res) => {
        if (res.ok) navigate('/settings/preferences/extensions')
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

  return (
    <SettingsLayout id="s3-extension-config-page" footerId="s3-extension-config-footer">
      <PageHeader
        title="Configurar S3"
        subtitle="Destino usado pela retenção para arquivar gravações expiradas antes de apagá-las."
      />
      {!loaded ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : (
        <div className="bg-surface border border-border rounded-lg p-5 max-w-md">
          <div className="space-y-3">
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
          <div className="flex justify-between gap-2 mt-5">
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
            <div className="flex gap-2">
              <Button
                id="s3-config-cancel"
                variant="ghost"
                onClick={() => navigate('/settings/preferences/extensions')}
              >
                Cancelar
              </Button>
              <Button
                id="s3-config-apply"
                onClick={handleApply}
                disabled={
                  saving ||
                  !form.name ||
                  !form.bucket ||
                  (!existing && (!form.access_key || !form.secret_key))
                }
              >
                {saving ? 'Aplicando...' : 'Aplicar'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Excluir configuração"
        message="Excluir a configuração do S3? Gravações que apontam pra ela como destino de retenção voltarão a ser apagadas."
        confirmLabel="Excluir"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
        danger
      />
    </SettingsLayout>
  )
}
