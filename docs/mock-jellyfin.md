# Mock Jellyfin

`pnpm dev` uses a local mock API so the app works without Jellyfin, credentials
or network access after the fixtures have been fetched.

## Fixtures

`pnpm mock:fetch` downloads 20-second excerpts of public-domain films from the
Internet Archive and builds:

1. an MKV with an embedded SRT and an external SRT;
2. an MP4 with an external VTT;
3. a multi-audio MKV with embedded ASS/SRT and an external SRT.

The fixtures live in `.dovenv/dev/fixtures` and are git-ignored. The tracked
`.dovenv/dev/fixtures/README.md` records sources and licensing.

The command uses `ffmpeg` and `ffprobe`; override their binaries with
`FFMPEG_PATH`/`FFPROBE_PATH` if needed.

## Mock API

`pnpm mock:server` starts a fake Jellyfin server:

- default URL `http://127.0.0.1:8096`;
- default API key `dev-key`;
- endpoints for items, series episodes, images, streams, downloads and external
  subtitles;
- HTTP Range support for media files.

The mock adds a synthetic series (`Public Domain Matinee`) with two episodes and
a home video (`Garden Home Video`) on top of the three movie fixtures, so the
catalog, episode browsing and item-type handling can be tested locally.

`scripts/dev.ts` sets `JELLYFIN_URL`, `JELLYFIN_API_KEY` and development
state directories before starting Vite. `MOCK_STREAM_DELAY_MS` can add a
delay to media responses for restart/resume testing.

## Data flow

```text
pnpm dev
  -> ensure fixtures
  -> start mock API on :8096
  -> wait for /System/Info/Public
  -> start Vite on :5173 with mock env
```

`pnpm dev-remote` skips the mock and runs Vite against the real server from
`.env`.

## Licensing

The fixtures are public-domain excerpts, not full movies. Artificial subtitle
text was created for development and does not reproduce film dialogue. See
`.dovenv/dev/fixtures/README.md` for details and attribution.
