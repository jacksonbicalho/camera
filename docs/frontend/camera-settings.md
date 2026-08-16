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
- `pages/settings/CamerasSettingsPage.tsx` (`/settings/cameras`) — lista
  como `Card`s, thumbnail 80×48px do snapshot. Badges condicionais
  ("Detecção" verde, "Gravando" vermelho, "Análise de objetos" azul). No
  modo admin, drag-and-drop pra reordenar (`PUT /api/settings/cameras/reorder`).

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

## Ver também
- [routing-editing.md](routing-editing.md) — padrão de rota e o carve-out sempre-editável
- [design-system.md](design-system.md) — `SettingsSection`/tokens usados nos painéis, `ApplyButton` compartilhado pelo botão "Aplicar" de cada seção
