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

## Decisões e invariantes

- A migração das cores cruas (`bg-gray-900`/`text-white`) pros papéis semânticos é **incremental** — boa parte do app ainda usa classes Tailwind diretas, com o bloco legado `[data-mode="light"]` remapeando a rampa de cinzas.
- **Exceção deliberada: MUI** (`@mui/material`/`@mui/x-date-pickers`/`@emotion/*`). O app é 100% Tailwind + `react-day-picker` + `@radix-ui/react-slot` — **exceto** o `TimeRangeFilterPanel` do Histórico (dial de relógio `TimePicker`, pedido explícito do navigator, história `feat/historico-filtro-intervalo-horario`), que precisa do MUI X. `MuiThemeProvider` (`components/MuiThemeProvider.tsx`) mapeia o `mode` resolvido do `ThemeContext` e o token `--color-primary` pro tema do MUI — **não é montado globalmente em `App.tsx`**, só embrulha quem genuinamente usa MUI por baixo. Não é precedente geral: não migrar outros componentes pra MUI só porque a dependência já está instalada.
- **Color mode ≠ tema ≠ accent**: `dark`/`light`/`system` são **modos de cor**; o **tema** é a identidade (paleta + tipografia); **accent** é um **3º eixo independente** (cor de destaque — `--color-primary`/`--color-primary-strong`/`--color-ring`), ortogonal aos outros dois. `data-accent` só é setado quando o accent não é `'default'` (`'default'` = sem override, fica com o azul base de `themes/default.css` — e mesmo assim é uma opção normal em `AppearanceSettingsPage`, não um fallback invisível). Ambas as preferências persistem via `GET/PUT /api/me/preferences` → `user_settings` (chaves `theme`/`accent`).
- **Adicionar um accent** = novo bloco `[data-accent="<nome>"]` em `themes/accents.css` + entrada em `ACCENT_OPTIONS` (`AppearanceSettingsPage.tsx`) + `validAccents` (`internal/server/theme.go`).
- **Adicionar um tema** no futuro = novo conjunto de valores de tokens, sem refatorar componentes.
- Toda UI nova usa tokens semânticos (`bg-surface`/`text-foreground`), nunca cor fixa tipo `bg-black`/`text-white` hardcoded — mesmo pra "chrome" de player (ver [player.md](player.md)).

## Ver também
- [player.md](player.md) — `PlayerFooter` theme-aware
- [shell-layout.md](shell-layout.md) — `.page-content` e a largura do conteúdo
