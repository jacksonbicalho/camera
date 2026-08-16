import { useEffect, useState } from 'react'
import ConfirmDialog from '../../components/ConfirmDialog'
import { authHeaders } from '../../auth'
import { Button } from '@/components/ui/button'
import { ApplyButton } from '@/components/ui/apply-button'
import { HardDrive, Check, Settings } from '@/components/Icons'
import ExtensionCard from '@/components/ExtensionCard'
import ExtensionActiveToggle from '@/components/ExtensionActiveToggle'

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
  description: string
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
//
// Redesenho (história fix/extension-card-compartilhado-e-s3-redesign, T2) —
// chrome visual (card/ícone+halo/nome/descrição) e o controle "Ativado"
// migraram pra ExtensionCard/ExtensionActiveToggle (T1 da mesma história,
// compartilhados com TelegramExtensionCard). Ícone: sem asset oficial da AWS
// disponível ainda — HardDrive (Icons.tsx) num avatar circular como
// fallback, trocável depois sem mexer no resto do componente. `savedActive`
// (novo estado, só alimenta o selo do toggle) é atualizado por `loadActive`
// — que já roda no mount e de novo (com sucesso ou falha) ao final de
// `handleApply` — então sempre reflete a verdade do servidor, sem lógica
// duplicada.
//
// Card uniforme + botão "Configurar" (história
// fix/extension-cards-uniformes-e-ajustes-perfil, T2) — o formulário de
// destino não é mais gated por `activeStaged` (isso fazia o card crescer
// pra sempre depois de ativado, destoando do tamanho fixo do Telegram).
// `configuring` (novo estado local, sempre nasce `false`) controla a
// visibilidade do formulário — o toggle "Ativado" e `configuring` andam
// juntos (`onChange` chama `setConfiguring(checked)` direto, nos dois
// sentidos: ligar abre, desligar fecha — achado do navigator testando a
// branch: manter o form aberto depois de desligar o toggle era
// confuso). O botão "Configurar" (linha do rodapé, ao lado de "Aplicar"
// — não perto do toggle, também pedido do navigator vendo a página
// real) é a via independente pra reabrir uma config já ativa sem
// precisar desligar/religar o toggle; vira "Cancelar" (mesma posição,
// mesmo id trocado por `s3-config-cancel`) enquanto `configuring` está
// aberto — achado do navigator vendo a página real: sem essa troca, o
// formulário não tinha NENHUMA forma explícita de fechar (só desligar
// o toggle ou aplicar). "Cancelar" descarta a edição em curso
// (`setActiveStaged(savedActive)`/`setForm(savedForm)`) e fecha — igual
// à semântica de "Cancelar" já usada em outras telas do app
// (ProfilePage etc.). Só ESSE caminho garante que uma edição não-salva
// não "vaze" pra próxima vez que o form reabrir — desligar o toggle
// direto (o outro caminho de fechar) ainda não reseta `form`, mesmo
// follow-up já registrado antes de T2 existir. Fecha também quando
// `handleApply` termina com sucesso (além do desligar o toggle e do
// Cancelar).
// `hasChanges` (T3 da mesma história) estende a regra de habilitação
// por divergência do Telegram (CA5 de T5, história anterior) pro S3 —
// `savedForm` espelha `form`, atualizado no mesmo ponto (mount e pós-
// `handleApply`); cobre o toggle (`activeStaged !== savedActive`) e os
// campos de texto do formulário, com `access_key`/`secret_key` (campos
// WRITE-ONLY — a API nunca devolve o valor salvo) só contando como
// divergência quando preenchidos (nunca "vazio" vs. "salvo mascarado").
// Botão "Aplicar": `disabled={saving || invalidToActivate || !hasChanges}`.
export default function S3ExtensionCard() {
  const [existing, setExisting] = useState<RetentionExtension | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [available, setAvailable] = useState(false)
  const [description, setDescription] = useState('')
  const [activeStaged, setActiveStaged] = useState(false)
  const [savedActive, setSavedActive] = useState(false)
  const [configuring, setConfiguring] = useState(false)
  const [savedForm, setSavedForm] = useState(emptyForm())

  const loadRetentionExtension = () =>
    fetch('/api/retention-extensions', { headers: authHeaders() })
      .then((r) => r.json())
      .then((list: RetentionExtension[]) => {
        const re = list?.[0] ?? null
        setExisting(re)
        const next = re
          ? {
              name: re.name,
              endpoint: re.endpoint,
              bucket: re.bucket,
              region: re.region,
              access_key: '',
              secret_key: '',
              prefix: re.prefix,
            }
          : emptyForm()
        setForm(next)
        setSavedForm(next)
      })
      .catch(() => {})
      .finally(() => setLoaded(true))

  const loadActive = () =>
    fetch('/api/settings/extensions', { headers: authHeaders() })
      .then((r) => r.json())
      .then((list: ({ id: string } & ExtensionState)[]) => {
        const s3 = list?.find((e) => e.id === 's3')
        setAvailable(s3?.available ?? false)
        setDescription(s3?.description ?? '')
        setActiveStaged(s3?.active ?? false)
        setSavedActive(s3?.active ?? false)
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
        .then((res) => {
          if (res.ok) setConfiguring(false)
        })
        .catch(() => {})
        .finally(() => {
          setSaving(false)
          loadRetentionExtension()
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
      .then((activeRes) => {
        if (activeRes?.ok) setConfiguring(false)
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

  const invalidToActivate =
    activeStaged &&
    (!form.name || !form.bucket || (!existing && (!form.access_key || !form.secret_key)))

  const hasChanges =
    activeStaged !== savedActive ||
    form.name !== savedForm.name ||
    form.endpoint !== savedForm.endpoint ||
    form.bucket !== savedForm.bucket ||
    form.region !== savedForm.region ||
    form.prefix !== savedForm.prefix ||
    form.access_key !== '' ||
    form.secret_key !== ''

  return (
    <ExtensionCard
      id="s3-extension-card"
      icon={
        <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-primary">
          <HardDrive className="h-8 w-8 text-on-primary" />
        </div>
      }
      name="S3"
      description={description}
      available={available}
    >
      <ExtensionActiveToggle
        id="s3-active"
        checked={activeStaged}
        onChange={(checked) => {
          setActiveStaged(checked)
          setConfiguring(checked)
        }}
        savedActive={savedActive}
        description="Habilite para conectar e utilizar o armazenamento S3."
      />

      {configuring && (
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
        <div className="flex gap-2">
          {configuring ? (
            <Button
              id="s3-config-cancel"
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setActiveStaged(savedActive)
                setForm(savedForm)
                setConfiguring(false)
              }}
            >
              Cancelar
            </Button>
          ) : (
            <Button
              id="s3-config-configure"
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setConfiguring(true)}
            >
              <Settings className="h-4 w-4" />
              Configurar
            </Button>
          )}
          <ApplyButton
            id="s3-config-apply"
            saving={saving}
            disabled={invalidToActivate || !hasChanges}
            size="default"
            type="button"
            onClick={handleApply}
            icon={<Check className="h-4 w-4" />}
          />
        </div>
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
    </ExtensionCard>
  )
}
