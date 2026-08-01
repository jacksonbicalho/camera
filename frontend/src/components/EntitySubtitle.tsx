import { Link } from 'react-router-dom'

interface EntitySubtitleProps {
  parent?: { label: string; to: string }
  current: string
}

// EntitySubtitle — subtítulo de página no formato "Item / Seção", usado como
// `subtitle` do PageHeader nas páginas de settings com um nível de entidade
// (câmera, usuário). O separador é puramente visual (CSS `::before`, sem nó de
// texto) para não entrar no textContent do subtítulo — mantém `h3.textContent`
// como só "ItemSeção" para quem lê o nome + a seção sem se importar com o "/".
export default function EntitySubtitle({ parent, current }: EntitySubtitleProps) {
  if (!parent) return <>{current}</>
  return (
    <>
      <Link to={parent.to} className="hover:text-foreground transition-colors">
        {parent.label}
      </Link>
      <span className="text-foreground before:content-['/'] before:mx-1.5 before:text-faint">
        {current}
      </span>
    </>
  )
}
