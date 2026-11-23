# Development

## Requirements

- Node.js 22.17+ (24 recommended)
- pnpm 12 (pinned in `packageManager`)
- ffmpeg with `libx264`, `libx265`, `libopus`, `libmp3lame`; libass for burn-in

## Commands

```bash
pnpm install
pnpm dev          # mock Jellyfin + Vite, no .env required
pnpm dev-remote   # Vite against the real Jellyfin server from .env
pnpm check        # svelte-kit sync + svelte-check
pnpm test         # unit tests
pnpm check:ts-only
pnpm lint         # oxlint
pnpm format       # prettier
pnpm format:check
pnpm build
pnpm audit
pnpm security:audit
pnpm verify       # check + test + lint + format + build + production audit
```

Release helpers:

```bash
pnpm push         # interactive Conventional Commit + push
pnpm release:dry  # preview the next release
pnpm release      # bump, changelog, tag, GitHub release and Docker workflow
```

The banner is printed by `startup.ts` before `vite dev` or the production server.
The data-directory preflight and job restore run when the SvelteKit server module
loads: immediately in production, on the first request in `vite dev`.

`pnpm dev` automatically downloads the public-domain fixtures if they are
missing, starts the mock API on `127.0.0.1:8096`, waits for it and then starts
Vite on `localhost:5173`. It writes development settings, downloads and jobs to
`data/dev-*`.

`pnpm dev-remote` only runs Vite. It reads `.env` through SvelteKit/Vite and
expects a reachable Jellyfin server.

Advanced mock commands:

```bash
pnpm mock:fetch    # download/regenerate fixtures
pnpm mock:server   # start only the mock API
```

## GitHub and releases

The repository is set up for Conventional Commits, release-it and GitHub
Actions:

- `main` is the release branch;
- `.github/workflows/ci.yml` runs checks, tests, lint, formatting, build and a
  production audit on pushes and pull requests;
- `.github/workflows/publish.yml` builds multi-arch images on `v*` tags;
- `.release-it.ts` bumps the version, updates the changelog, creates the tag and
  the GitHub release;
- Dependabot updates npm dependencies and GitHub Actions weekly.

Initial setup if the repository is cloned without history:

```bash
git init -b main
git add .
git commit -m "chore: initial commit"
git remote add origin git@github.com:<user>/jellyfin-downloader.git
git push -u origin main
```

## TypeScript-only

All authored source is TypeScript: routes, server modules, tests, mock and
tooling. Svelte components use `<script lang="ts">`. SvelteKit output in
`build/` and `.svelte-kit/` is generated JavaScript.

`pnpm check:ts-only` scans `src`, `.dovenv/scripts`, `.dovenv/dev` and `tests`
for hand-written `.js` sources and untyped Svelte script tags.

## Tooling

- **Prettier** formats Svelte, TypeScript, JSON, CSS and Markdown.
- **Oxlint** lints TypeScript/JavaScript.
- VS Code recommends `oxc.oxc-vscode`, `svelte.svelte-vscode` and
  `esbenp.prettier-vscode`, with format-on-save and Oxc code actions.
- The Svelte MCP server is configured through `@sveltejs/opencode`; see
  [AGENTS.md](../AGENTS.md).

## Project conventions

- Svelte 5 runes only: `$state`, `$derived`, `$props`, `$effect`, snippets.
- No Svelte stores, `<slot>`, `on:click` or `export let`.
- UI strings must go through `i18n.t()`; add all three locales.
- Tests and documentation are written in English.
- No `^` in `package.json`; use `~` and the lockfile.
- Do not add dependencies for small utilities that can be written with the
  standard library.
- Do not expose Jellyfin credentials, server paths or ffmpeg paths to clients.
