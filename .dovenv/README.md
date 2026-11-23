# .dovenv

Development tooling intentionally kept outside the workspace root.

- `scripts/` — dev orchestration, startup banner/entrypoint, mock server
  entrypoints, fixture builder and TypeScript-only checker.
- `dev/mock-jellyfin/` — fake Jellyfin API (native `node:http`).
- `dev/fixtures/` — public-domain clips, generated media, posters and manifest.
  Media and generated files are git-ignored; the README is tracked.

Commands are exposed from the root `package.json`:

```bash
pnpm dev
pnpm dev-remote
pnpm mock:fetch
pnpm mock:server
pnpm check:ts-only
```

The mock and fixtures are excluded from the Docker build; only
`scripts/startup.ts` is copied into the runtime image.
