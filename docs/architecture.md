# Architecture

## High level

```text
Browser (Svelte 5)
   |  same-origin fetch
   v
SvelteKit server (adapter-node)
   |-- /api/v1/*               public server API
   |-- Jellyfin client         server-only API key
   |-- job manager             durable queue + recovery
   |-- local downloads store   deterministic output reuse
   |-- logger                  JSONL events under data/logs
   |-- ffmpeg                  spawn with discrete arguments
   v
Jellyfin / filesystem
```

The UI and third-party clients use the same `/api/v1` contract.

## Source layout

```text
src/
├── const/                 app constants, cookies and defaults
├── core/                  runes state: i18n and theme contexts
├── lib/
│   ├── components/        generic UI primitives
│   ├── ui/                app-specific UI
│   ├── i18n/              translation and locale detection
│   ├── format.ts          locale-aware formatting
│   └── types.ts           shared client/server types
├── locales/               en.ts, es.ts, ca.ts
├── routes/
│   ├── +layout.server.ts  locale/theme from cookies
│   ├── +layout.svelte     contexts, header, theme/language selectors
│   ├── +page.server.ts    SSR catalog (movies, series, home videos)
│   ├── +page.svelte       full-width library browser
│   ├── downloads/         local downloads page
│   ├── settings/          global settings + presets
│   └── api/
│       ├── _shared/       server-only logic shared by pages and API
│       └── v1/            versioned public endpoints
├── app.css                tokens, light/dark themes, local font
├── app.html               %lang% and %theme% placeholders
├── env.ts                 typed private environment variables
└── hooks.server.ts        locale/theme, security headers, CORS
```

Server-only modules live in `src/routes/api/_shared` and are imported through
`#api/_shared/*`. They are not route files.

## Request lifecycle

1. `hooks.server.ts` reads `jd_locale_mode` and `jd_theme` cookies.
2. It resolves the locale from the `Accept-Language` header for `auto`.
3. `transformPageChunk` replaces `%lang%` and `%theme%` in `app.html`.
4. `+layout.server.ts` exposes locale/theme state to the layout.
5. The layout creates the i18n and theme contexts with runes.
6. Page data is rendered server-side; client interactions use `/api/v1`.

## Downloads

- `POST /api/v1/downloads` validates the movie/episode/options, builds a
  normalized plan and computes a deterministic cache key.
- Series are browsed through `GET /api/v1/series/{id}`; downloads use episode
  IDs and include the series and episode code in the output name.
- The job manager stores the plan and state in `SERVER_JOBS_DIR`.
- Only one ffmpeg job runs at a time by default.
- The source is downloaded to a per-job working directory; ffmpeg remuxes or
  re-encodes it into the requested output.
- Hardware encoding is detected from ffmpeg encoders and the platform device;
  a failed hardware attempt is retried once in software.
- Batch requests create independent durable jobs with one shared configuration.
- The logger appends structured JSONL events under `data/logs`; the UI shows
  transient toasts and Settings → Logs reads the persisted entries.
- If the local store is enabled, the final file is committed atomically.
- Jobs are restored after a restart; see [jobs.md](jobs.md).

## Security boundaries

- `JELLYFIN_API_KEY`, Jellyfin URLs, cache paths and ffmpeg paths stay on the
  server.
- Client input is validated against real Jellyfin media metadata.
- ffmpeg receives generated paths and discrete argument arrays; `shell` is
  disabled.
- API clients never select filesystem paths or remote URLs.
- The API is unauthenticated by design; deploy it behind a trusted proxy/VPN.
