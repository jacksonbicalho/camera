import { useState } from 'react'
import SettingsLayout from '../../components/SettingsLayout'
import PageHeader from '../../components/PageHeader'
import SettingsSection from '../../components/SettingsSection'
import ReleaseNotesMarkdown from '../../components/ReleaseNotesMarkdown'
import { Button } from '../../components/ui/button'
import { ChevronDown } from '../../components/Icons'
import { useAbout, type AboutInfo } from '../../hooks/useSettings'
import { useUpdates } from '../../hooks/useUpdates'
import { getRole } from '../../auth'

function fmtUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

// UpdateAlertRow — última linha do card "Informações do servidor" (pedido do
// navigator: o alerta de atualização deixou de ser uma seção própria abaixo
// do card). O resumo + botão "Atualizar agora" ficam na mesma linha
// (data-update-row); o changelog (ReleaseNotesMarkdown) fica atrás de um
// disclosure colapsado por padrão — antes aparecia sempre expandido.
function UpdateAlertRow() {
  const { status, applyUpdate } = useUpdates()
  const [applying, setApplying] = useState(false)
  const [applyMsg, setApplyMsg] = useState('')
  const [applyErr, setApplyErr] = useState('')
  const [expanded, setExpanded] = useState(false)

  // A linha só existe quando há de fato uma atualização disponível: sem update,
  // em dia ou com erro de checagem, fica em silêncio (não renderiza nada).
  if (getRole() !== 'admin' || !status || status.error || !status.update_available) {
    return null
  }

  const onApply = async () => {
    setApplying(true)
    setApplyErr('')
    const res = await applyUpdate()
    if (res.ok) {
      setApplyMsg('Atualizando… o servidor vai reiniciar em instantes.')
    } else {
      setApplyErr(res.error || 'Falha ao iniciar a atualização.')
      setApplying(false)
    }
  }

  return (
    <div className="border-t border-border px-5 py-3">
      {applyMsg ? (
        <p id="update-applying" className="text-sm text-foreground">
          {applyMsg}
        </p>
      ) : (
        <>
          <div data-update-row className="flex items-center justify-between gap-3">
            {status.notes_md ? (
              <button
                type="button"
                onClick={() => setExpanded((e) => !e)}
                aria-expanded={expanded}
                aria-controls="update-notes"
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <ChevronDown
                  className={`w-4 h-4 text-faint transition-transform shrink-0 ${expanded ? 'rotate-180' : ''}`}
                />
                <span className="truncate text-sm font-medium text-foreground">
                  Nova versão <span className="font-mono">{status.latest}</span> disponível
                </span>
              </button>
            ) : (
              <span className="truncate text-sm font-medium text-foreground">
                Nova versão <span className="font-mono">{status.latest}</span> disponível
              </span>
            )}

            {status.apply_mode === 'self-replace' && (
              <Button
                id="update-apply-button"
                variant="default"
                size="sm"
                onClick={onApply}
                disabled={applying}
              >
                {applying ? 'Atualizando…' : 'Atualizar agora'}
              </Button>
            )}
          </div>

          {expanded && status.notes_md && (
            <div id="update-notes" className="mt-3">
              <ReleaseNotesMarkdown md={status.notes_md} />
            </div>
          )}

          {status.apply_mode === 'docker' && (
            <div id="update-docker" className="mt-3 text-xs text-muted-foreground">
              <p>Atualize a imagem Docker e recrie o container:</p>
              <pre className="mt-1 rounded bg-surface-2 p-2 font-mono text-foreground">
                docker compose pull && docker compose up -d
              </pre>
              <p className="mt-1">
                Imagem: <span className="font-mono">{status.image}</span>
              </p>
            </div>
          )}

          {status.apply_mode === 'notify' && (
            <p id="update-notify" className="mt-3 text-xs text-muted-foreground">
              Atualização automática indisponível neste ambiente — baixe a nova versão manualmente.
            </p>
          )}

          {applyErr && (
            <p id="update-apply-error" className="mt-3 text-sm text-danger">
              {applyErr}
            </p>
          )}
        </>
      )}
    </div>
  )
}

// ReleaseNotesSection — changelog (body) da release do GitHub que corresponde
// EXATAMENTE à versão instalada (release_notes_md/release_notes_version vêm de
// /api/about, buscados por tag via internal/release.NotesFetcher — não a
// "latest" do checker de updates, que a API do GitHub nunca resolve como
// pré-release). Ao contrário de UpdatesSection, é visível a qualquer role e não
// depende de haver update pendente — é só "o que tem na release desta versão".
function ReleaseNotesSection({ about }: { about: AboutInfo }) {
  if (!about.release_notes_md) return null

  return (
    <section id="release-notes-section" className="mt-8">
      <h3 className="text-h3 font-semibold text-foreground mb-3">
        Release notes
        {about.release_notes_version && (
          <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">
            {about.release_notes_version}
          </span>
        )}
      </h3>
      <div id="release-notes-md" className="rounded-lg border border-border bg-surface p-4">
        <ReleaseNotesMarkdown md={about.release_notes_md} />
      </div>
    </section>
  )
}

export default function AboutPage() {
  const about = useAbout()

  return (
    <SettingsLayout id="about-page" footerId="about-footer">
      <PageHeader title="Sobre" subtitle="Versão instalada, commit e tempo de atividade." />
      {!about ? (
        <p className="text-muted-foreground text-sm">Carregando...</p>
      ) : (
        <SettingsSection
          title="Informações do servidor"
          fields={[
            { label: 'Versão', value: about.version || 'dev' },
            { label: 'Commit', value: about.commit || '—' },
            { label: 'Build', value: about.built_at || '—' },
            { label: 'Ativo há', value: fmtUptime(about.uptime_seconds) },
            { label: 'Go', value: about.go_version },
          ]}
        >
          <UpdateAlertRow />
        </SettingsSection>
      )}
      {about && <ReleaseNotesSection about={about} />}
    </SettingsLayout>
  )
}
