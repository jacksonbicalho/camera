# Configuração de câmera

`/settings/cameras` (lista), `/settings/cameras/:id` (detalhe, sempre
editável), `/settings/cameras/zones/:id` (zonas) — ver
[routing-editing.md](routing-editing.md) pro padrão de rota "seção antes do
id" e o carve-out sempre-editável desta página.

## Arquivos principais

- `components/CameraForm.tsx` — formulário de câmera, usado hoje **só** em
  `/settings/cameras/new` (criação — precisa continuar 1 form único com 1
  Salvar/Cancelar, já que não existe câmera existente pra aplicar patches
  parciais). Organizado em sessões com responsabilidade clara, sem bucket
  genérico "Configurações avançadas": Nome (sozinha), Captura (propriedades
  da CONEXÃO — protocolo/URL, codec/áudio/resolução detectados, intervalo
  de reconexão), Gravação (`recording_enabled` esconde os campos
  dependentes quando desligado), Transmissão (`live_enabled`, campo
  separado de `live_transport`). Painéis seguem o estilo de
  `SettingsSection` (`bg-surface border border-border rounded-lg` + título
  `text-h4 uppercase tracking-wider`).
- `components/cameraFormFields.tsx` — blocos de campos
  (`NameField`/`CaptureFields`/`RecordingFields`/`TransmissionFields`)
  extraídos de `CameraForm`, presentacionais puros (`form`/`set` por prop) —
  reusados tanto pelo form único de criação quanto pelas seções
  sempre-editáveis de edição abaixo. `CaptureFields` recebe `codecDisabled`
  por prop; `TransmissionFields` recebe `rtspUrl` por prop — desacopla a JSX
  de ONDE o valor vem, permitindo fontes diferentes sem duplicar markup.
- `components/CameraCaptureSection.tsx` / `CameraRecordingSection.tsx` /
  `CameraTransmissionSection.tsx` — sessões "Nome e Captura"/"Gravação"/
  "Transmissão" de `CameraDetailSettingsPage`, sempre editáveis: `<form>`/
  Aplicar próprio, `useState(() => emptyForm(cam))` sem resincronizar,
  payload parcial sobre um `emptyForm(cam)` FRESCO no momento do save (nunca
  reverte silenciosamente uma edição feita em outra seção nesse meio-tempo).
- `components/CameraMotionSection.tsx` (exporta `MotionFormContent`/
  `MotionReadOnly`) — sessão "Detecção de movimento". `<form>`/botão
  `motion-save` **independente** do `camera-form-save`. Renderiza sempre
  (visualização e edição) — só o próprio `motion_enabled` controla o
  conteúdo interno. Campo de substream RTSP (`capture_type==='rtsp'`) mora
  aqui. Título/borda vivem num wrapper privado `MotionPanel`; sub-blocos
  usam `FieldGroup` (privado, sem `Card` próprio) em vez de `SettingsSection`
  aninhado (evita painel-dentro-de-painel).
- `components/CameraAnalysisSection.tsx` — sessão "Detector de objetos"
  (título exibido; nome do componente/arquivo continua `Analysis`, ligado à
  API por trás). **Só no branch admin** (a API é `authAdmin`, viewer não
  teria dado pra mostrar). Checkbox Habilitado + select Detector + slider de
  Limiar + botão "Aplicar" próprio (`camera-analysis-save`), mesmo padrão
  das outras seções (`size="sm"`, alinhamento à esquerda).
- `pages/settings/CameraDetailSettingsPage.tsx` — branch **admin**: monta
  `CameraCaptureSection`+`CameraRecordingSection`+`CameraTransmissionSection`
  +`MotionFormContent`+`CameraAnalysisSection`, as 5 seções sempre
  editáveis, cada uma com seu próprio "Aplicar". `SettingsSection`
  "Identificação" mostra só o ID (Nome vive em `CameraCaptureSection`).
  `PageHeader.actions` tem o botão "+ Nova câmera" (id `camera-create`, só
  admin) — mesma posição/estilo nas 3 telas de câmera (lista/detalhe/zonas).
  Branch **viewer**: usa `CameraCaptureView` (privado ao arquivo), read-only,
  espelhando as mesmas sessões/condicionais de show-hide; recebe um shape
  estrutural (`CameraViewFields`) satisfeito tanto por `Camera` (admin)
  quanto `CameraSettings` (viewer). `DeviceInfoPanel` renderiza sempre por
  último.
- `components/CameraCard.tsx` — chrome análogo a `ExtensionCard.tsx` (ver
  [extensions.md](extensions.md)): `bg-surface border border-border
  rounded-xl p-6 max-w-md`, id explícito por prop. Diferente de
  `ExtensionCard` (ícone com halo), a câmera tem uma imagem real — por isso
  `thumbnail` é `ReactNode` livre, não um slot de ícone fixo. `children` é
  opcional (o viewer não tem ação nenhuma); o divisor (`border-t`) só
  aparece quando `children` existe, ao contrário de `ExtensionCard` onde
  `children` sempre está presente. Props HTML extras (`...rest`, incluindo
  `draggable`/`onDragStart`/`onDragOver`/`onDrop`/`onDragEnd`) são
  repassadas pro `<div>` raiz — é assim que `CamerasSettingsPage` pluga
  drag-and-drop sem o componente conhecer a lógica de reordenação.
- `pages/settings/CamerasSettingsPage.tsx` (`/settings/cameras`) — grade
  lado a lado de `CameraCard` (`id="cameras-grid"`, `flex flex-row
  flex-wrap gap-6`, mesma classe literal de
  `PreferencesExtensionsPage.tsx`), não mais uma lista de linhas
  empilhadas (história `refactor/camera-list-cards`). Cada card tem id
  `camera-card-<id>`. Thumbnail do snapshot em destaque no topo (dentro do
  `Link` pro detalhe). Badges condicionais ("Detecção" verde, "Gravando"
  vermelho, "Análise de objetos" azul). No branch admin, `children` = botões
  **Configurar** (ícone `Settings`, mesmo rótulo/ícone que
  `S3ExtensionCard` já usa — reforça o "mesmo modelo de extensões") e
  **Excluir**; drag-and-drop pra reordenar (`PUT
  /api/settings/cameras/reorder`) é plugado via props spread no `CameraCard`
  — o card inteiro é a área arrastável, sem handle (`GripVertical`)
  dedicado. Branch viewer: sem `children`, sem drag.

## Decisões e invariantes

- **`CameraDetailSettingsPage` abandonou o modo Editar** (história
  `refactor/camera-detail-secoes-aplicar`): o navigator reportou que
  alternar pra "Editar" abria todas as seções de uma vez sem deixar claro
  se "Salvar" salvava só o que estava acima ou a página inteira — confirmado
  via pergunta direta que a página deveria abandonar de vez o toggle, não só
  dividir o Salvar. As 5 seções seguem o mesmo padrão desde então: sempre
  editável, "Aplicar" próprio.
- **Invariante `live_transport=webrtc` ⇒ `video_codec='h264'`**: WebRTC só
  toca H.264 no browser, e o backend (`webrtc.ShouldRunHLS`) só desliga o
  pipeline HLS quando o codec RESOLVIDO é H.264. `CameraCaptureSection`
  reflete o estado já salvo (`codecDisabled` derivado do `cam` persistido) e
  força `video_codec:'h264'` no próprio payload se `codecDisabled`, pra
  nunca sair dessincronizado mesmo com um form local não-aplicado. É
  `CameraTransmissionSection` quem GARANTE a invariante no próprio save dela
  (ao aplicar com `live_transport==='webrtc'`, força o codec independente do
  form local de Captura). Ao SAIR do webrtc, `CameraTransmissionSection` não
  restaura o codec customizado anterior — a restauração via `useRef` existia
  no antigo `CameraForm` único; com os saves independentes, cada seção não
  tem mais acesso ao form local da outra. O usuário escolhe de novo se quiser.
- Nome não ganhou seção própria em `CameraCaptureSection` — campo único,
  painel dedicado seria desproporcional (decisão do navigator); vive dentro
  da MESMA `<div>` de borda que Captura, não um bloco visualmente separado.
- **`/settings/cameras` virou grade de cards a pedido explícito do
  navigator** ("mesmo modelo de extensões", história
  `refactor/camera-list-cards`): a lista antiga era `Card` genérico em
  linha horizontal única (`flex flex-col gap-2`, thumbnail 80×48px + nome +
  badges + botões tudo numa linha, com `GripVertical` como handle dedicado
  de drag). O card inteiro já era a área de drag de fato antes da migração
  (o `GripVertical` era só ícone decorativo, não o iniciador real do
  evento `dragstart`) — trocar pra "card inteiro arrastável" é só mudança
  de affordance visual, não de comportamento de interação. O botão que era
  "Editar" (ícone `Pencil`) virou "Configurar" (ícone `Settings`), mesmo
  rótulo/ícone que `S3ExtensionCard` já usa.
  `e2e/tests/cameras-settings-mobile.spec.ts` (CA7 de
  `feat/badge-cards-responsivo`) foi adaptado pro novo id
  (`camera-card-<id>`) e pro novo risco: como o card já é vertical por
  construção, a asserção deixou de provar "quebra em linhas" (só fazia
  sentido pra linha horizontal antiga) e passou a provar que o card
  (`max-w-md` ~448px) e o bloco de ações não vazam da viewport mobile
  (375px).

## Ver também
- [routing-editing.md](routing-editing.md) — padrão de rota e o carve-out sempre-editável
- [design-system.md](design-system.md) — `SettingsSection`/tokens usados nos painéis, `ApplyButton` compartilhado pelo botão "Aplicar" de cada seção
- [extensions.md](extensions.md) — `ExtensionCard`, o modelo de chrome que `CameraCard` replica
