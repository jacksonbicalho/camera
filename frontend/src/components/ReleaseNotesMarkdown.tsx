import type { ReactNode } from 'react'

// renderInline — as três formatações inline usadas no changelog gerado
// (.github/workflows/release.yml, step "Generate grouped release notes"):
// **negrito** (scope do commit), `código` (hash curto) e [texto](url) (link de
// compare). Não é um parser de markdown genérico — só o suficiente pro formato
// real que a pipeline gera.
function renderInline(text: string): ReactNode[] {
  const pattern = /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)/g
  const nodes: ReactNode[] = []
  let last = 0
  let key = 0
  let m: RegExpExecArray | null
  while ((m = pattern.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    if (m[1] !== undefined) {
      nodes.push(<strong key={key++}>{m[1]}</strong>)
    } else if (m[2] !== undefined) {
      nodes.push(
        <code key={key++} className="rounded bg-surface-2 px-1 py-0.5 text-[0.9em] text-foreground">
          {m[2]}
        </code>,
      )
    } else {
      nodes.push(
        <a
          key={key++}
          href={m[4]}
          target="_blank"
          rel="noreferrer"
          className="text-primary hover:underline"
        >
          {m[3]}
        </a>,
      )
    }
    last = m.index + m[0].length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

interface ReleaseNotesMarkdownProps {
  md: string
}

// ReleaseNotesMarkdown — renderiza o changelog agrupado por tipo (feat/fix/...)
// publicado nas releases do GitHub: headers `### <título>`, listas `- <item>` e
// as formatações inline de renderInline. Usado por AboutPage (UpdatesSection e
// ReleaseNotesSection) — mesma fonte/formato nos dois lugares.
export default function ReleaseNotesMarkdown({ md }: ReleaseNotesMarkdownProps) {
  const blocks: ReactNode[] = []
  let list: string[] = []
  let key = 0

  function flushList() {
    if (list.length === 0) return
    blocks.push(
      <ul key={key++} className="list-disc space-y-1 pl-4">
        {list.map((item, i) => (
          <li key={i}>{renderInline(item)}</li>
        ))}
      </ul>,
    )
    list = []
  }

  for (const line of md.split('\n')) {
    if (line.startsWith('### ')) {
      flushList()
      blocks.push(
        <h4 key={key++} className="mt-4 text-sm font-semibold text-foreground first:mt-0">
          {renderInline(line.slice(4))}
        </h4>,
      )
    } else if (line.startsWith('- ')) {
      list.push(line.slice(2))
    } else if (line.trim() !== '') {
      flushList()
      blocks.push(
        <p key={key++} className="mt-2">
          {renderInline(line)}
        </p>,
      )
    }
  }
  flushList()

  return <div className="text-xs text-muted-foreground">{blocks}</div>
}
