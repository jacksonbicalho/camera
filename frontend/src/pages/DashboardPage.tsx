import Layout from '../components/Layout'
import PageHeader from '../components/PageHeader'

// DashboardPage — o papel de "todas as câmeras" migrou pra AllCamerasPage (rota
// "/"); esta página fica como stub no layout novo para o roadmap futuro de um
// dashboard real. Rota órfã por enquanto: "/dashboard" (sem link em nenhum
// sidebar ainda, mesmo padrão de /events e /users).
export default function DashboardPage() {
  return (
    <Layout id="dashboard-page" footerId="dashboard-footer" contentClassName="p-6">
      <div id="dashboard-content" className="page-content">
        <PageHeader id="dashboard-header" title="Dashboard" />
      </div>
    </Layout>
  )
}
