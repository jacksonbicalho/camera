import Layout from '../components/Layout'
import PageHeader from '../components/PageHeader'

interface PlaceholderPageProps {
  /** Título da seção (ex: "Mapas"). */
  title: string
  /** Texto opcional abaixo do título. */
  description?: string
}

// Página placeholder para seções da nav rail ainda não implementadas (Mapas,
// Dispositivos, Usuários, Relatórios). Cada uma será substituída pela página
// real nas histórias seguintes do roadmap do redesign.
export default function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <Layout id="placeholder-page" footerId="placeholder-footer" contentClassName="p-6">
      <div id="placeholder-content" className="page-content space-y-4">
        <div id={`placeholder-${title.toLowerCase()}`} className="max-w-2xl">
          <PageHeader
            title={title}
            subtitle={description ?? 'Esta seção ainda está em construção.'}
          />
        </div>
      </div>
    </Layout>
  )
}
