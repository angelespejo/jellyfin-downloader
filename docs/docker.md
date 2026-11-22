# Docker

The published image is `ghcr.io/angelespejo/jellyfin-downloader`, available for
`linux/amd64` and `linux/arm64` and tagged `latest`, `X.Y` and `X.Y.Z`. The
package is public, so pulling does not require `docker login`.

It is a multi-stage `node:24-bookworm-slim` build. Debian `ffmpeg`,
`ca-certificates` and `fonts-dejavu-core` are installed at runtime, so burn-in
subtitles work without extra mounts.

## Quick start

```bash
cp .env.example .env
# Set JELLYFIN_SERVER and JELLYFIN_API_KEY
mkdir -p data
docker compose up -d
```

The root `docker-compose.yml` pulls the published image and stores state in
`./data`, mounted at `/data`:

- `/data/settings.json` — global settings and presets;
- `/data/jobs` — durable job state;
- `/data/logs` — persisted JSONL logs;
- `/data/downloads` — optional local output store.

The container runs as `node` (UID 1000). Bind-mounted directories must be
writable by that user.

Ready-made recipes, from a minimal container to Jellyfin plus GPU passthrough,
live in [Docker Compose examples](docker-compose.md).

## Connecting to Jellyfin

`JELLYFIN_SERVER` is resolved inside the container, so `localhost` is the
container itself.

| Where Jellyfin runs             | Value                              |
| ------------------------------- | ---------------------------------- |
| Docker Desktop host             | `http://host.docker.internal:8096` |
| Linux host, with `extra_hosts`  | `http://host.docker.internal:8096` |
| Linux host, without extra hosts | `http://<LAN-IP>:8096`             |
| Another compose service         | `http://<service-name>:8096`       |
| Another machine                 | `http://<hostname-or-IP>:8096`     |

On Linux, add the host gateway to the service:

```yaml
extra_hosts:
  - 'host.docker.internal:host-gateway'
```

## Hardware acceleration

For VAAPI/QSV on Linux, pass the render device and groups:

```yaml
devices:
  - /dev/dri:/dev/dri
group_add:
  - video
  - render
```

Then set `FFMPEG_HWACCEL=vaapi` or `qsv`, or leave `auto` so the app probes the
container at startup.

NVENC requires the NVIDIA container toolkit and the host driver. VideoToolbox is
only available on macOS hosts running natively; it does not exist in the Linux
container. If the encoder is listed but the GPU is not usable, the job retries in
software.

## Healthcheck

The image and compose file check `/api/v1/health`. The endpoint reports ffmpeg
availability and local store status without contacting Jellyfin.

```bash
docker compose ps
curl -s http://localhost:3000/api/v1/health
```

## Updating

```bash
docker compose pull
docker compose up -d
```

Jobs are durable: a container recreated with the same `/data` volume keeps its
state, and queued or running jobs resume. `stop_grace_period: 30s` gives the app
time to persist state before shutdown.

## Build from source

```bash
docker build -t jellyfin-downloader .
docker run --rm -p 3000:3000 \
  -e JELLYFIN_SERVER=http://host.docker.internal:8096 \
  -e JELLYFIN_API_KEY=... \
  -v "$PWD/data:/data" \
  jellyfin-downloader
```

The runtime does not need `node_modules`: `node build` is self-contained. The
`Publish Docker image` workflow builds and pushes the multi-arch image on `v*`
tags.
