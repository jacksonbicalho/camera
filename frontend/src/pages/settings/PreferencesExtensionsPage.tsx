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
//
// Cards lado a lado (história fix/altura-consistente-extension-card):
// `flex-row flex-wrap` em vez de empilhados — cada `ExtensionCard` já tem
// `max-w-md` e altura consistente entre si (`available=true`/`false`), então
// a grid horizontal não desalinha; `flex-wrap` garante que a página continua
// usável em telas estreitas.
export default function PreferencesExtensionsPage() {
  return (
    <SettingsLayout id="preferences-extensions-page" footerId="preferences-extensions-footer">
      <PageHeader title="Preferências" subtitle="Extensões disponíveis para esta instância." />
      <PreferencesLayout active="extensions">
        <div className="flex flex-row flex-wrap gap-6">
          <TelegramExtensionCard />
          <S3ExtensionCard />
        </div>
      </PreferencesLayout>
    </SettingsLayout>
  )
}
