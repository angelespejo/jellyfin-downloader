# Docker

The image is a multi-stage `node:24-bookworm-slim` build. It uses pnpm for the
build and installs Debian `ffmpeg`, `ca-certificates` and
`fonts-dejavu-core` at runtime.

## Compose

```bash
cp .env.example .env
# Set JELLYFIN_SERVER and JELLYFIN_API_KEY
mkdir -p data
docker compose up -d --build
```

`./data` is mounted at `/data`:

- `/data/settings.json` — global settings/presets;
- `/data/jobs` — durable job state;
- `/data/logs` — persisted JSONL logs;
- `/data/downloads` — optional local output store.

The container runs as `node` (UID 1000). Make `data/` writable by that user.

## Hardware acceleration

The image uses Debian ffmpeg. VideoToolbox is only available on macOS hosts
running natively (not in the Linux container). For VAAPI/QSV, pass the render
device and groups in compose:

```yaml
devices:
  - /dev/dri:/dev/dri
group_add:
  - video
  - render
```

Set `FFMPEG_HWACCEL=vaapi` or `qsv` to force it, or leave `auto`. NVENC requires
the NVIDIA container toolkit and the host driver. If the encoder is listed but
the GPU is not usable, the job retries in software.

## Environment

Compose reads `.env` for interpolation and passes the required variables into
the container. `ORIGIN` should match the public URL when using a reverse proxy.

If Jellyfin is on the Docker host:

- Docker Desktop (macOS/Windows): `host.docker.internal`;
- Linux: uncomment `extra_hosts` in `docker-compose.yml`.

## Healthcheck

The image and compose file check `/api/v1/health`. The endpoint reports ffmpeg
availability and local store status without contacting Jellyfin.

## Manual build

```bash
docker build -t jellyfin-downloader .
docker run --rm -p 3000:3000 \
  -e JELLYFIN_SERVER=http://host.docker.internal:8096 \
  -e JELLYFIN_API_KEY=... \
  -v "$PWD/data:/data" \
  jellyfin-downloader
```

The runtime does not need `node_modules`: `node build` is self-contained.
