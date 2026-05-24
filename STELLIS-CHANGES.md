# STELLIS Fork — изменения относительно stoatchat/for-web

Локальный форк для адаптации Stoat under "STELLIS" closed-tribe инстанс.
Upstream: `https://github.com/stoatchat/for-web`

## Применённые strip-изменения

### 1. `packages/client/src/interface/Discover.tsx` — disabled
Был iframe-wrapper к https://stt.gg (Stoat discovery service для публичных серверов). Для closed-instance не нужен.

**Заменён на:** redirect к `/` через `onMount → navigate("/", { replace: true })`. Сохраняет export name `Discover`, чтобы не ломать route registration в `index.tsx`. -91 строк.

### 2. `packages/client/src/interface/channels/AgeGate.tsx` — pass-through
Был geo-blocking (fetch к https://geo.revolt.chat — deprecated endpoint) + NSFW age confirmation.

**Заменён на:** `<>{props.children}</>`. Trust-based — для тусы 5 человек без необходимости age-gate. -145 строк.

## Не делано (но запланировано в strip-map)

3. `Sidebar.tsx` — multi-server переключатель. Оставлен как есть — single-server поведение и так наглядно (одна иконка), Discord-style UX узнаваем. Отключение `+ создать сервер` кнопки требует править ServerList component.
4. `FlowCreate.tsx` — public registration. Backend invite-only выключает регистрацию без кода на API-уровне; UI «Create Account» с инвайт-полем сохранён.
5. NSFW флаги в settings — оставлены (если не настраиваешь — не видны).
6. Bots-platform — не вырезан (если не используешь — не видишь).

## Brand rename (Stoat → Stellis, applied)

### `packages/client/index.html`
- `<title>Stoat</title>` → `<title>Stellis</title>`
- `<meta name="theme-color" content="#000000">` → `#11141C` (deep indigo)

### `packages/client/vite.config.ts` — PWA manifest
- `name: "Stoat"` → `"Stellis"`
- `short_name: "Stoat"` → `"Stellis"`
- `description: "User-first open source chat platform."` → `"Голоса между своими."`
- `background_color: "#101823"` → `"#11141C"`
- `theme_color: "#101823"` → `"#11141C"`

### `i18n/catalogs/{en,en-US,ru}/messages.po`
Sed-replace `Stoat` → `Stellis` (91 строк всего в трёх каталогах).

Затронуло strings типа:
- "Discover Stoat" → "Discover Stellis"
- "Donate to Stoat" → "Donate to Stellis"
- "Stoat Lounge" → "Stellis Lounge"
- "Sign into Stoat" → "Sign into Stellis"
- "Stoat is one of the best ways to..." → "Stellis is one of the best ways to..."

**Что НЕ переименовано (намеренно):**
- `@revolt/*` path-aliases в tsconfig — 608 импортов, internal naming, не видно юзеру
- `REVOLT__*` env vars в `secrets.env` — backend Stoat API expects exact names
- MongoDB database name `revolt` — миграция risky, никто не видит
- `Revolt.toml` filename — Stoat API reads exact filename

## Что ещё в branding TODO

Палитра STELLIS (см. `~/.gstack/projects/claude/stellis-branding.md`):
- deep indigo bg (`oklch(15% 0.02 250)`)
- warm gold accent (`oklch(78% 0.16 80)`)
- Fraunces / Inter / JetBrains Mono

**Где править:** `packages/client/panda.config.ts` — Material Design tokens `--md-sys-color-primary`, `--md-sys-color-surface` etc. нужно перебиндить на наши OKLCH значения.

## Build issues

Vite build падает из-за tooling chain Stoat'а (требует `mise` для управления версиями Node + lingui config ESM-loading). Чтобы build заработал:

```bash
brew install mise
cd /Users/zimin/for-web
mise install
mise build
```

Затем deploy artifact:
```bash
# Build outputs to packages/client/dist
scp -r packages/client/dist/* root@157.22.231.196:/srv/stellis-web/

# Update compose.override.yml to mount custom web volume
# (instead of using ghcr.io/stoatchat/for-web image)
```

## Upstream tracking

Чтобы получать апдейты Stoat:
```bash
git remote add upstream https://github.com/stoatchat/for-web.git
git fetch upstream
git merge upstream/main
# resolve conflicts in stripped files
```

## Commit разметка

Все Stoat-strip коммиты помечать prefix'ом `stellis:` чтобы легко отделять от upstream'а:
- `stellis: disable Discover (closed instance)`
- `stellis: disable AgeGate (trusted users)`
- `stellis: rebrand colors to deep indigo + gold`
