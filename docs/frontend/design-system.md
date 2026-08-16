# Design tokens e tema

Base estrutural organizada como **tema → modo → valores**, dividida em
arquivos importados por `src/index.css` (que é só `@import`, nesta ordem:
`tailwindcss` → `styles/primitives.css` → `styles/themes/default.css` →
`styles/themes/accents.css` → `styles/base.css`).

## Arquivos principais
- `styles/primitives.css` — `@theme` com tipografia + rampas cruas (gray/accents) base.
- `styles/themes/default.css` — o tema default: papéis semânticos no `@theme` (modo dark) e o bloco `[data-mode="light"]` (override do claro + inversão da rampa + tints + logo). O cabeçalho do arquivo documenta **como adicionar um tema** (`themes/<nome>.css` com `[data-theme="<nome>"]` e `[data-theme="<nome>"][data-mode="light"]`, + `ThemeContext` aplicando `data-theme`).
- `styles/themes/accents.css` — o eixo de cor de destaque (ver "Color mode ≠ tema ≠ accent" abaixo).
- `styles/base.css` — keyframes, `body`, cursor, `.page-content` (ver [shell-layout.md](shell-layout.md)), `.scrollbar-thin`.
- `contexts/ThemeContext.tsx` — expõe `mode`/`setMode`, `theme` (hoje só `'default'`) e `accent`/`setAccent`; aplica `data-mode`/`data-accent` no `<html>`.

## Tokens (blocos `@theme` do Tailwind v4, geram utilitários)

- **Tipografia**: escala `text-display/h1/h2/h3/h4/body/caption` (size + line-height) → use os utilitários (`text-h2`, `text-h4`…) em vez de tamanhos soltos (`text-lg`/`text-xs`).
- **Cor semântica**: papéis `bg-background`, `bg-surface`, `bg-surface-2`, `text-foreground`, `text-muted`, `text-faint`, `border-border`, `bg-primary`/`text-on-primary`, `bg-danger/success/warning`. Os valores no `@theme` são o **modo dark** (padrão); `[data-mode="light"]` sobrescreve **só** os tokens semânticos que mudam (accents seguem vívidos).

## Componentes de UI compartilhados (`components/ui/`)

Primitivos hand-rolled (sem lib de UI nova, mesma técnica dos demais em
`components/ui/`) usados em mais de uma área do app:

- `components/ui/switch.tsx` (`Switch`) — widget trilho+bolinha
  (`h-5 w-14 rounded-full border-2` + bolinha `h-6 w-6`, cores
  `border-primary`/`border-faint`), um único `<button role="switch"
  aria-checked>` que carrega `children` como rótulo/legenda (evita
  `<button>` aninhado — um `Switch` separado dentro de outro botão seria
  HTML inválido). Props: `id`/`checked`/`onChange`/`disabled`/`icon`
  (renderizado dentro da bolinha)/`className`/`children`. Extraído do JSX
  duplicado byte a byte entre `ExtensionActiveToggle.tsx` (ver
  [extensions.md](extensions.md)) e `#history-continuous-toggle` em
  `HistoryPage.tsx` (ver [pages.md](pages.md)) — história
  `refactor/switch-apply-button-compartilhados` (T1).
- `components/ui/apply-button.tsx` (`ApplyButton`) — botão
  "Aplicar"/"Aplicando..." sobre o `Button` existente: texto sempre
  `saving ? 'Aplicando...' : 'Aplicar'`, `disabled={saving || disabled}`,
  `size` (default `'sm'`), `type` (`'submit'` default ou `'button'` +
  `onClick`), `icon` opcional. Extraído dos 8 lugares que repetiam esse
  bloco à mão: as 5 seções sempre-editáveis de câmera (ver
  [camera-settings.md](camera-settings.md)), `CameraMotionTelegramNotify`,
  e os cards de extensão `TelegramExtensionCard`/`S3ExtensionCard` (ver
  [extensions.md](extensions.md)) — história
  `refactor/switch-apply-button-compartilhados` (T2).

## Decisões e invariantes

- A migração das cores cruas (`bg-gray-900`/`text-white`) pros papéis semânticos é **incremental** — boa parte do app ainda usa classes Tailwind diretas, com o bloco legado `[data-mode="light"]` remapeando a rampa de cinzas.
- **Exceção deliberada: MUI** (`@mui/material`/`@mui/x-date-pickers`/`@emotion/*`). O app é 100% Tailwind + `react-day-picker` + `@radix-ui/react-slot` — **exceto** o `TimeRangeFilterPanel` do Histórico (dial de relógio `TimePicker`, pedido explícito do navigator, história `feat/historico-filtro-intervalo-horario`), que precisa do MUI X. `MuiThemeProvider` (`components/MuiThemeProvider.tsx`) mapeia o `mode` resolvido do `ThemeContext` e o token `--color-primary` pro tema do MUI — **não é montado globalmente em `App.tsx`**, só embrulha quem genuinamente usa MUI por baixo. Não é precedente geral: não migrar outros componentes pra MUI só porque a dependência já está instalada.
- **Color mode ≠ tema ≠ accent**: `dark`/`light`/`system` são **modos de cor**; o **tema** é a identidade (paleta + tipografia); **accent** é um **3º eixo independente** (cor de destaque — `--color-primary`/`--color-primary-strong`/`--color-ring`), ortogonal aos outros dois. `data-accent` só é setado quando o accent não é `'default'` (`'default'` = sem override, fica com o azul base de `themes/default.css` — e mesmo assim é uma opção normal em `AppearanceSettingsPage`, não um fallback invisível). Ambas as preferências persistem via `GET/PUT /api/me/preferences` → `user_settings` (chaves `theme`/`accent`).
- **Adicionar um accent** = novo bloco `[data-accent="<nome>"]` em `themes/accents.css` + entrada em `ACCENT_OPTIONS` (`AppearanceSettingsPage.tsx`) + `validAccents` (`internal/server/theme.go`).
- **Adicionar um tema** no futuro = novo conjunto de valores de tokens, sem refatorar componentes.
- Toda UI nova usa tokens semânticos (`bg-surface`/`text-foreground`), nunca cor fixa tipo `bg-black`/`text-white` hardcoded — mesmo pra "chrome" de player (ver [player.md](player.md)).
- A consistência do botão "Aplicar" entre seções era garantida por um teste de regressão cross-file (`CameraAnalysisSection.test.tsx` comparando o tamanho do botão contra outras seções) em vez de pela própria construção — removido junto com a extração de `ApplyButton`; a asserção equivalente (`size="sm"` por padrão → `h-8`) agora vive no teste do próprio componente (`apply-button.test.tsx`).

## Ver também
- [player.md](player.md) — `PlayerFooter` theme-aware
- [extensions.md](extensions.md) — `ExtensionActiveToggle` (consumidor do `Switch`), cards de extensão (consumidores do `ApplyButton`)
- [camera-settings.md](camera-settings.md) — seções sempre-editáveis de câmera (consumidoras do `ApplyButton`)
- [shell-layout.md](shell-layout.md) — `.page-content` e a largura do conteúdo
