import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useEventSource } from '../hooks/useEventSource'
import { Button } from './ui/button'

// UpdateProgressModal — modal bloqueante (sem fechar até estado terminal)
// que mostra progresso linha a linha do auto-update via SSE
// (/api/updates/apply/live). A conexão cai DE PROPÓSITO no meio do fluxo —
// o processo antigo é substituído e re-executado (ver
// internal/updater.Applier.OnStep, step "restarting") — então onError SÓ
// vira "reconectando" se esse step já tiver chegado (sawRestartingRef,
// abaixo); antes disso é uma queda de conexão de verdade e vira erro
// direto, terminal, com botão de fechar (nunca falso-sucesso nem
// travamento permanente). Depois de "reconectando", o EventSource do
// navegador reconecta sozinho por padrão, e quando o onopen disparar de
// novo (processo novo já respondendo) o estado vira sucesso. Um
// EventUpdateFailed explícito (download com checksum inválido, por
// exemplo — o processo antigo continua de pé pra reportar isso) chega como
// mensagem normal, não como queda de conexão, e vira erro direto.
type Phase =
  | { kind: 'connecting' }
  | { kind: 'progress'; steps: string[] }
  | { kind: 'reconnecting'; steps: string[] }
  | { kind: 'success'; steps: string[] }
  | { kind: 'error'; steps: string[]; message: string }

const STEP_LABELS: Record<string, string> = {
  downloading: 'Baixando a nova versão…',
  snapshot: 'Fazendo snapshot do banco de dados…',
  replacing: 'Trocando o binário…',
  restarting: 'Aplicando a atualização…',
}

function stepsOf(phase: Phase): string[] {
  return 'steps' in phase ? phase.steps : []
}

export interface UpdateProgressModalProps {
  open: boolean
  onDone: () => void
}

export default function UpdateProgressModal({ open, onDone }: UpdateProgressModalProps) {
  const [phase, setPhase] = useState<Phase>({ kind: 'connecting' })
  const dialogRef = useRef<HTMLDivElement>(null)
  // Só uma queda de conexão DEPOIS do step "restarting" é o reexec matando o
  // processo de propósito — qualquer onError antes disso é um erro de
  // conexão de verdade (rede, proxy, token), não "reconectando esperado".
  // Ref (não state) porque só é lido dentro dos handlers de useEventSource,
  // nunca precisa disparar render por si só.
  const sawRestartingRef = useRef(false)

  // Reseta o estado ao (re)abrir — ajuste durante o render, não em useEffect
  // (setState síncrono num efeito dispara render em cascata; ver
  // react-hooks/set-state-in-effect).
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) setPhase({ kind: 'connecting' })
  }

  useEffect(() => {
    if (open) {
      // Refs não são estado de render — resetar aqui (não no bloco acima) é
      // o lugar sancionado, ao contrário de setState num efeito.
      sawRestartingRef.current = false
      dialogRef.current?.focus()
    }
  }, [open])

  const terminal = phase.kind === 'success' || phase.kind === 'error'
  // Uma vez terminal, encerra a conexão de propósito — nada mais a ouvir.
  const path = open && !terminal ? '/api/updates/apply/live' : null

  const onMessage = useCallback((data: string) => {
    let parsed: { step?: string; failed?: boolean; error?: string }
    try {
      parsed = JSON.parse(data)
    } catch {
      return
    }
    if (parsed.failed) {
      setPhase((p) => ({
        kind: 'error',
        steps: stepsOf(p),
        message: parsed.error || 'Falha ao aplicar a atualização.',
      }))
      return
    }
    if (parsed.step) {
      if (parsed.step === 'restarting') sawRestartingRef.current = true
      const label = STEP_LABELS[parsed.step] || parsed.step
      setPhase((p) => ({ kind: 'progress', steps: [...stepsOf(p), label] }))
    }
  }, [])

  // A queda de conexão só é a esperada (reexec matando o processo de
  // propósito) se já vimos o step "restarting" — qualquer erro antes disso é
  // uma falha de conexão de verdade (rede, proxy, token expirado), não uma
  // reconexão que deva terminar em sucesso. Sem essa distinção, um onError
  // cedo (antes de qualquer step) promovido a "reconectando" corre dois
  // riscos: virar falso-sucesso se o EventSource reconectar sozinho sem
  // nunca ter havido update de verdade, ou travar o modal pra sempre em
  // "reconectando" se o navegador não tentar reconectar (o único jeito de
  // fechar é chegando a um estado terminal).
  const onError = useCallback(() => {
    setPhase((p) => {
      if (p.kind === 'success' || p.kind === 'error') return p
      if (sawRestartingRef.current) return { kind: 'reconnecting', steps: stepsOf(p) }
      return {
        kind: 'error',
        steps: stepsOf(p),
        message: 'Conexão perdida antes da atualização terminar. Tente novamente.',
      }
    })
  }, [])

  const onOpen = useCallback(() => {
    setPhase((p) => (p.kind === 'reconnecting' ? { kind: 'success', steps: p.steps } : p))
  }, [])

  useEventSource(path, onMessage, { onOpen, onError })

  if (!open) return null

  const steps = stepsOf(phase)

  // Portalado direto pra document.body — mesmo motivo de ConfirmDialog
  // (stacking context de um ancestral prenderia o z-index aqui dentro).
  // z-10000 pra vencer os flyouts da Sidebar (zIndex 9999), como lá.
  return createPortal(
    <div className="fixed inset-0 z-10000 flex items-center justify-center bg-black/70 p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-progress-title"
        tabIndex={-1}
        className="w-full max-w-md rounded-xl bg-surface p-6 outline-none"
      >
        <h2 id="update-progress-title" className="text-h3 font-semibold text-foreground mb-4">
          Atualizando o servidor
        </h2>

        {phase.kind === 'connecting' && (
          <p className="text-sm text-muted-foreground">Conectando…</p>
        )}

        <ul aria-live="polite" className="space-y-2">
          {steps.map((step, i) => (
            <li key={i} className="text-sm text-foreground">
              {step}
            </li>
          ))}
        </ul>

        {phase.kind === 'reconnecting' && (
          <p className="mt-4 text-sm text-foreground" aria-live="assertive">
            Reiniciando o servidor… reconectando
          </p>
        )}
        {phase.kind === 'success' && (
          <p className="mt-4 text-sm text-foreground" aria-live="assertive">
            Atualização concluída com sucesso!
          </p>
        )}
        {phase.kind === 'error' && (
          <p className="mt-4 text-sm text-danger" aria-live="assertive">
            {phase.message}
          </p>
        )}

        {terminal && (
          <Button variant="default" size="sm" onClick={onDone} className="mt-4">
            Fechar
          </Button>
        )}
      </div>
    </div>,
    document.body,
  )
}
