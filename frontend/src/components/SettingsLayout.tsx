import AppLayout from "./AppLayout";
import { SettingsSidebar } from "./SettingsSidebar";
import { getRole } from "../auth";

// Usuários/Servidor/Armazenamento/Sistema/Estatísticas/Aparência/Sobre saíram
// daqui — migraram pro Layout novo (Sidebar/Preferências, /preferences/*). Deixar
// esses links aqui levaria pra um Layout/chrome diferente no meio da navegação
// lateral do settings legado, então saem da lista — só o que continua de fato
// dentro do SettingsLayout.
const BASE_NAV_LINKS = [
  { to: "/settings/cameras", label: "Câmeras" },
  { to: "/settings/discover", label: "Rastrear câmeras" },
  { to: "/settings/analysis", label: "Análise de vídeo" },
];

const VIEWER_NAV_LINKS = BASE_NAV_LINKS.filter(l => l.to === "/settings/cameras");

interface SettingsLayoutProps {
  children: React.ReactNode;
}

export default function SettingsLayout({ children }: SettingsLayoutProps) {
  const navLinks = getRole() === "admin" ? BASE_NAV_LINKS : VIEWER_NAV_LINKS;

  return (
    <AppLayout mainClassName="w-full h-full flex flex-col">
      <h2 className="text-2xl font-bold text-white mb-6 shrink-0">Configurações</h2>
      <div className="flex gap-10 flex-1 min-h-0">
        <SettingsSidebar NAV_LINKS={navLinks} />
        <div className="flex-1 min-w-0 overflow-y-auto pb-6">{children}</div>
      </div>
    </AppLayout>
  );
}
