# Changelog

All notable changes are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/) and the project uses
[Semantic Versioning](https://semver.org/).

## Unreleased

### Added

- `docs/docker-compose.md` with progressive examples: minimal, persistent, pinned
  version, reverse proxy, local downloads store, GPU passthrough and a full stack
  with Jellyfin.

### Changed

- The bundled `docker-compose.yml` pulls the published
  `ghcr.io/angelespejo/jellyfin-downloader` image instead of building locally.
- The README documents the Docker installation step by step and links to the
  Compose examples.

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

[Unreleased]: https://github.com/angelespejo/jellyfin-downloader/compare/v0.1.0...HEAD
[v0.1.0]: https://github.com/angelespejo/jellyfin-downloader/releases/tag/v0.1.0
