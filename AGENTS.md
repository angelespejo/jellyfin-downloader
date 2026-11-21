# AGENTS.md

Single-package SvelteKit 3 + Svelte 5 (runes) app that browses a Jellyfin movie library and builds downloads with ffmpeg.

## Rules

- **TypeScript and Svelte only.** Source files are `.ts`, `.svelte.ts`, `.svelte` or CSS. Never add hand-written `.js`/`.jsx`/`.vue` source or another UI framework. SvelteKit's `build/` and `.svelte-kit/` output is generated JavaScript and is exempt.
- **Tests and documentation are English.** UI strings are translated through `src/locales/{en,es,ca}.ts`; never hardcode user-facing text in components.
- **Svelte 5 only.** Use `$state`, `$derived`/`$derived.by`, `$props`, `$effect`, snippets and `{@render children()}`. Never use `export let`, `<slot>`, `createEventDispatcher`, `on:click` or Svelte stores.
- **Minimal dependencies.** Prefer platform APIs and the standard library. Check whether an existing helper covers the job before adding a package. Never use `^` in `package.json`; use `~` plus the lockfile.
- **Security first.** Never import `$app/env/private` values into client code. Never expose `JELLYFIN_API_KEY`, Jellyfin URLs, cache paths or ffmpeg paths to clients. Never render remote data with `{@html}`.
- **English server messages.** API errors are English with stable codes; the UI localizes them by code.
- **Durable jobs.** Any change to job creation/processing must preserve restart recovery and state persistence.
- **Accessibility.** Use real buttons/links, translated `aria-label`s, visible focus and keyboard navigation. Keep contrast valid in both themes.

## Svelte MCP

The official Svelte MCP is configured through `@sveltejs/opencode` in `.opencode/`. Use it when writing, reviewing or debugging Svelte code:

- `list-sections` to discover documentation sections;
- `get-documentation` before using unfamiliar Svelte 5/SvelteKit 3 APIs;
- `svelte-autofixer` on new or edited `.svelte` files;
- `playground-link` when a minimal reproduction helps.

Configuration lives in `.opencode/opencode.json` and `.opencode/svelte.json`. The plugin also provides the `svelte-file-editor` subagent, skills and instructions.

## Commands

```bash
pnpm install
pnpm dev          # mock Jellyfin + Vite (:8096 mock, :5173 app)
pnpm dev-remote   # Vite against real Jellyfin from .env
pnpm mock:fetch
pnpm mock:server
pnpm check
pnpm check:ts-only
pnpm test
pnpm lint
pnpm lint:fix
pnpm format
pnpm format:check
pnpm build
pnpm audit
```

`pnpm dev` must work without `.env` or any extra command. It auto-fetches fixtures when missing. `pnpm dev-remote` must not start the mock.

## Structure

```text
.dovenv/              development tooling, mock API and fixtures
.opencode/            OpenCode + Svelte MCP configuration
.vscode/              recommended extensions and format-on-save
docs/                 development and operations documentation (English)
src/const/            app constants and cookie names
src/core/             runes state and contexts (i18n, theme)
src/lib/ui/           app-specific UI (MovieDialog, OutputSettings, JobPanel)
src/lib/components/   generic primitives (Icon, ModalShell, Tabs, Field, EmptyState)
src/lib/i18n/         translation and locale detection
src/locales/          en.ts, es.ts, ca.ts (flat keys)
src/routes/api/_shared/  server-only Jellyfin, ffmpeg, plan, jobs, settings
src/routes/api/v1/       public versioned API
src/routes/downloads/    local downloads page
src/routes/settings/     settings tabs and preset modal
```

Server code is shared by SSR pages and the API; it must stay under
`src/routes/api/_shared` and never be imported by client modules.

## Jobs and storage

- `JobStore` writes one atomic JSON file per job under `SERVER_JOBS_DIR`.
- On restart, `queued`/`running` jobs are re-queued, complete source files are reused, partial outputs are discarded and ffmpeg resumes from the last completed step.
- Graceful shutdown persists jobs and keeps working directories; it must not mark them cancelled.
- Local outputs live under `SERVER_LOCAL_DOWNLOADS_DIR` with a deterministic SHA-256 key.
- Settings live in `SERVER_SETTINGS_FILE`, are validated, written atomically and use optimistic revision checks.

## Internationalization

- `src/locales/en.ts` is the source of truth; `es.ts` and `ca.ts` must match exactly.
- Locale modes: `auto`, `en`, `es`, `ca`. Automatic uses the first browser language: Spanish → `es`, Catalan → `ca`, anything else → `en`.
- UI text must use `i18n.t()`; server codes use `i18n.error(code, fallback)`.
- Dates/languages/numbers use `Intl` with `i18n.locale`.
- Cookies: `jd_locale_mode`, `jd_theme`. The server renders `%lang%` and `%theme%` in `app.html`.

## Theming

- Modes: `system`, `light`, `dark`; default `system`.
- Use tokens from `src/app.css`; do not hardcode colours.
- Plus Jakarta Sans is local in `static/fonts`; no remote fonts.
- Keep both palettes and focus states accessible.

## API

- Public API is `/api/v1`; the UI uses the same endpoints.
- Validate every request against strict enums and real Jellyfin metadata.
- Use discrete ffmpeg arguments with `shell: false`.
- Never accept filesystem paths, remote URLs or raw ffmpeg arguments from clients.
- Keep OpenAPI (`src/routes/api/_shared/openapi.ts`) and `docs/api.md` in sync.
- API errors are English with stable codes.

## Formatting and linting

- Prettier config: no semicolons, single quotes, width 100, Svelte plugin.
- Oxlint extends `recommended`; warnings are not failures but should be kept clean.
- VS Code uses Prettier on save and `source.fixAll.oxc`.
- Run `pnpm check`, `pnpm test`, `pnpm lint`, `pnpm format:check`, `pnpm build` and `pnpm audit` before finishing.

## Response style

Concise and direct. Prefer complete code changes over descriptions. Do not claim runtime verification that was not performed.
