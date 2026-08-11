import SettingsLayout from '../../components/SettingsLayout'
import PageHeader from '../../components/PageHeader'
import PreferencesLayout from '../../components/PreferencesLayout'
import TelegramExtensionCard from './TelegramExtensionCard'
import S3ExtensionCard from './S3ExtensionCard'

// PreferencesExtensionsPage — rota /settings/preferences/extensions (história
// refactor/preferencias-submenu-lateral-storage, T4): mostra o conteúdo de
// TODAS as extensões juntas nesta única página — substitui o desenho
// anterior (T1/T2), onde "Extensões" era um grupo de sub-rotas, uma por
// extensão (TelegramExtensionPage/S3ExtensionConfigPage). Pedido do
// navigator testando a branch: o submenu deve ter só 3 links fixos
// (Extensões/Aparência/Armazenamento), e clicar em "Extensões" já mostra o
// conteúdo ali — sem navegar pra outra rota.
export default function PreferencesExtensionsPage() {
  return (
    <SettingsLayout id="preferences-extensions-page" footerId="preferences-extensions-footer">
      <PageHeader title="Preferências" subtitle="Extensões disponíveis para esta instância." />
      <PreferencesLayout active="extensions">
        <div className="flex flex-col gap-6">
          <TelegramExtensionCard />
          <S3ExtensionCard />
        </div>
      </PreferencesLayout>
    </SettingsLayout>
  )
}
