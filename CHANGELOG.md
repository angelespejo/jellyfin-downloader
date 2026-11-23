# Changelog

All notable changes are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/) and the project uses
[Semantic Versioning](https://semver.org/).

## Unreleased

## v0.2.0 - 2026-11-23

### Added

- Startup ASCII banner printed before Vite or the production server starts, with
  the URL, Jellyfin host, data directory and storage mode.
- Startup diagnostics recorded in the application log: settings creation,
  restored jobs, Jellyfin connectivity, ffmpeg/hardware and the missing
  authentication warning.
- `JELLYFIN_SERVER` is accepted as a deprecated alias of `JELLYFIN_URL`.
- Active download queue: card badges, a queue tab in the media dialog filtered to
  the open title or series, a **Downloading now** section on the downloads page,
  clickable queue titles, configuration badges and cancel actions.
- Pause, continue and restart for download jobs: paused jobs keep their work
  directory, source downloads continue with HTTP `Range`, completed ffmpeg steps
  are reused, and failed or cancelled jobs can be restarted with the same
  configuration.
- Lists render 20 records at a time and load the next page on scroll: the stored
  downloads page, the dialog downloads tab, catalog results and server logs.
- Play in Jellyfin link in the media dialog, redirected server-side to avoid
  exposing the internal Jellyfin URL.
- Episode deep links: the dialog URL switches to the episode id, keeping a back
  button to the series (including links from Downloads).
- Collapsible seasons (closed by default) with unavailable virtual episodes
  filtered out and reported.
- Background series-size calculation with a visible loading state.
- Search uses Jellyfin's native `SearchTerm` with pagination; the whole catalog is
  no longer downloaded on the first query.
- Active processing time stored per job and shown in the dialog and downloads;
  existing jobs show the original processing time when reused.
- Infinite scroll for the library search and the persisted logs, with visible
  **Load more** fallbacks.
- Select/deselect-all controls for audio and subtitles, plus a subtitle counter.
- Collapsible output, audio and subtitle sections in the media dialog.
- Selected-version weight in the dialog, series total weight, and the year in the
  dialog title.
- Original source weight in the queue rows and stored download cards.
- Tooltips on the media badges.
- `docs/docker-compose.md` with progressive examples: minimal, persistent, pinned
  version, reverse proxy, local downloads store, GPU passthrough and a full stack
  with Jellyfin.

### Changed

- `JELLYFIN_URL` replaces `JELLYFIN_SERVER`.
- Local downloads are enabled by default; set
  `SERVER_LOCAL_DOWNLOADS_ENABLED=false` to disable them.
- The settings file and data directories are created at startup instead of on the
  first request.
- The security note about missing authentication is no longer rendered in
  Settings; it is logged on startup.
- The library page no longer loads the whole catalog during SSR; search results
  are paginated on the server as the user scrolls.
- The Downloads tab counter now follows the stored results total instead of the
  initial summary snapshot, including deep links and background completions.
- Restart recovery now reuses completed ffmpeg steps instead of repeating every
  step after the source download.
- Deleting a stored download confirms with a floating toast instead of an inline
  notice.
- The bundled `docker-compose.yml` pulls the published
  `ghcr.io/angelespejo/jellyfin-downloader` image instead of building locally.
- The README documents the Docker installation step by step and links to the
  Compose examples.
- Stored download cards show size, original size, processing time and date as
  icon-labelled facts, with a full-width download action and the delete action
  moved next to it; queue rows use the same chip styling.
- Running downloads show a live elapsed timer in the queue and the dialog, ticking
  every second between API polls.
- The file type moved from the download card header to an icon-labelled fact, so
  the filename gets the full card width.
- The configuration badge is labelled **Output configuration** with a visible
  panel heading, and its popover is lifted above the page footer while open.

### Fixed

- Movie and series details failed with `Jellyfin responded with HTTP 400` on
  Jellyfin 12, which the UI reported as "Could not connect to Jellyfin". Item
  detail requests now include a resolved Jellyfin `userId`.

## v0.1.0 - 2026-11-21

### Added

- Browse and search Jellyfin movies, series and home videos.
- Configurable MKV/MP4/WebM output with copy or re-encode video/audio.
- Original, 4K, 2K, 1080p, 720p, 480p and 360p quality caps.
- Audio track selection and integrated, separate or burned subtitles.
- Hardware encoding detection with software fallback.
- Series batch downloads with episode/season selection.
- Reusable local downloads with deterministic cache keys.
- Configuration badges, popovers and one-click replication.
- Global notifications and persisted JSONL logs in Settings.
- Durable jobs, restart recovery and graceful shutdown.
- Preset tags and the presets API.
- English, Spanish and Catalan UI with system, light and dark themes.
- Docker image, CI, Dependabot and release automation.

[Unreleased]: https://github.com/angelespejo/jellyfin-downloader/compare/v0.2.0...HEAD
[v0.2.0]: https://github.com/angelespejo/jellyfin-downloader/releases/tag/v0.2.0
[v0.1.0]: https://github.com/angelespejo/jellyfin-downloader/releases/tag/v0.1.0
