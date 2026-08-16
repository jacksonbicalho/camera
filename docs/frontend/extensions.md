# Extensões (Preferências)

`/settings/preferences/extensions` mostra o conteúdo de **todas** as
extensões juntas na mesma página — clicar em "Extensões" no submenu de
`PreferencesLayout` (ver [shell-layout.md](shell-layout.md)) não navega pra
sub-rota nenhuma.

## Arquivos principais

- `pages/settings/PreferencesExtensionsPage.tsx` — empilha um
  `<Nome>ExtensionCard` por extensão (`flex flex-col gap-6`).
- `components/ExtensionCard.tsx` — chrome visual compartilhado por todo card
  de extensão: card (`bg-surface border border-border rounded-xl p-6
  max-w-md`), header (ícone com halo `blur-lg` atrás + nome `text-2xl
  font-bold` + descrição), divisor, e — se `available` — `children`; senão,
  "Extensão não permitida nesta instância.". O header (nome+descrição)
  aparece SEMPRE, mesmo com `available=false` — só o conteúdo específico da
  extensão (`children`) é gated.
- `components/ExtensionActiveToggle.tsx` — controle "Ativado" compartilhado:
  toggle switch (`<button role="switch" aria-checked>`, trilho+bolinha,
  mesmo padrão de `#history-continuous-toggle` em `HistoryPage`, ver
  [player.md](player.md)) + label/descrição, com um selo somente-leitura
  (`Badge` compartilhado, `variant="success"|"neutral"`) ao lado mostrando
  `savedActive` — o valor JÁ CONFIRMADO no servidor, distinto do `checked`
  staged que o toggle controla. Os dois podem divergir entre o usuário mexer
  no toggle e clicar "Aplicar".
- `pages/settings/TelegramExtensionCard.tsx` — fetch/PUT via
  `GET /api/settings/extensions` (lista completa, filtra por `id`) e
  `PUT /api/settings/extensions/telegram`. Estado `savedActive` (inicializado
  do fetch, reatribuído após PUT bem-sucedido — só se `response.ok`, uma
  falha HTTP não deve marcar como salvo) — botão "Aplicar" só habilita
  quando `activeStaged !== savedActive`.
- `pages/settings/S3ExtensionCard.tsx` — mais lógica de negócio que o
  Telegram: além do toggle `active`, tem um formulário de destino S3 (7
  campos, revelado quando `activeStaged`) e "Excluir configuração"
  (`s3-config-delete`, `ConfirmDialog`) — ambos como `children` extra dentro
  do `ExtensionCard`, sem equivalente no Telegram. "Aplicar" salva os dois
  juntos: `POST`/`PUT /api/retention-extensions` (destino, singleton — S3 é
  sempre 0 ou 1 linha) e depois `PUT /api/settings/extensions/s3` (toggle).
  Desmarcar e aplicar só desliga o toggle, sem apagar a config salva (fica
  pronta pra reativar sem preencher tudo de novo). Ícone: `HardDrive`
  (`Icons.tsx`) num avatar circular `bg-primary`/`text-on-primary` como
  fallback — sem asset de marca oficial da AWS disponível ainda.

## Decisões e invariantes

- **Um card só por extensão**, nunca um card de "Ativado" separado de um
  card de formulário — desenho anterior do S3 tinha os dois separados,
  revertido a pedido do navigator: "isso eu entendo que deva ser apenas um
  card: se for clicado em ativar, abrir as opções para configurar".
- **Descrição das extensões é genérica**, não amarrada ao caso de uso atual
  (`internal/server/extensions.go`, `extensionDTO.Description`) — o Telegram
  vai carregar outros tipos de aviso além de movimento no futuro; o S3 é
  "armazenamento em nuvem", não só "envia gravações expiradas".
- **`ExtensionActiveToggle.savedActive` alimenta só o selo, nunca a regra de
  habilitação de um botão "Aplicar" por conta própria** — cada card decide
  isso. No Telegram, o botão SÓ habilita quando `checked !== savedActive`
  (CA5 da história `fix/ajustes-icone-telegram-e-momentos`). No S3, o botão
  segue sua própria regra (`saving || invalidToActivate`, campos
  obrigatórios do formulário) — decisão de escopo deliberada: "salvo" no S3
  envolve toggle + até 7 campos, decidir o que conta como divergência ali é
  uma pergunta de produto separada, ainda não colocada na mesa.
- **`S3ExtensionCard.savedActive`** é atualizado por `loadActive()`, que já
  roda no mount E de novo (sucesso OU falha) ao final de `handleApply` —
  então sempre reflete a verdade do servidor, sem lógica duplicada de
  "só atualiza se ok" (diferente do Telegram, que precisa dessa checagem
  porque não teria outro refetch).
- Nenhuma das duas páginas por extensão que existiram antes
  (`TelegramExtensionPage.tsx`, `S3ExtensionConfigPage.tsx`) nem a landing
  que escolhia qual abrir primeiro existem mais — extinto quando o submenu
  deixou de ter sub-rota por extensão.

## Ver também
- [shell-layout.md](shell-layout.md) — `PreferencesLayout`
- [design-system.md](design-system.md) — `Badge` compartilhado, tokens do toggle
