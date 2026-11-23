# Docker Compose examples

Copy-paste recipes for the published image
`ghcr.io/angelespejo/jellyfin-downloader`, ordered from the simplest setup to a
full stack. The image is public, so `docker login` is never required.

Every example is self-contained: save it as `docker-compose.yml` in an empty
directory and run `docker compose up -d`. Use one example at a time, because they
all name the container `jellyfin-downloader`. Examples that use
`${VARIABLE:?message}` read the values from a `.env` file in the same directory.

- [1. Minimal](#1-minimal)
- [2. Recommended: persistent data](#2-recommended-persistent-data)
- [3. Pinned version and custom data directory](#3-pinned-version-and-custom-data-directory)
- [4. Behind a reverse proxy](#4-behind-a-reverse-proxy)
- [5. Local downloads store on a dedicated disk](#5-local-downloads-store-on-a-dedicated-disk)
- [6. Hardware acceleration](#6-hardware-acceleration)
- [7. Full stack with Jellyfin](#7-full-stack-with-jellyfin)
- [Validate, update and remove](#validate-update-and-remove)

## 1. Minimal

The fastest way to try the app. Everything is inline and nothing is persisted:
recreating the container deletes settings, jobs and logs.

```yaml
services:
  jellyfin-downloader:
    image: ghcr.io/angelespejo/jellyfin-downloader:latest
    container_name: jellyfin-downloader
    restart: unless-stopped
    ports:
      - '3000:3000'
    environment:
      JELLYFIN_URL: http://host.docker.internal:8096
      JELLYFIN_API_KEY: replace-with-your-api-key
      ORIGIN: http://localhost:3000
```

Run `docker compose up -d` and open <http://localhost:3000>.

Use `http://<jellyfin-host>:8096` instead of `host.docker.internal` when Jellyfin
is on another machine.

## 2. Recommended: persistent data

Adds a `.env` file, a bind mount for `/data`, graceful shutdown and the image
defaults. This is the repository root `docker-compose.yml`.

```yaml
services:
  jellyfin-downloader:
    image: ghcr.io/angelespejo/jellyfin-downloader:${JELLYFIN_DOWNLOADER_TAG:-latest}
    container_name: jellyfin-downloader
    restart: unless-stopped
    init: true
    stop_grace_period: 30s
    ports:
      - '${JELLYFIN_DOWNLOADER_PORT:-3000}:3000'
    environment:
      JELLYFIN_URL: ${JELLYFIN_URL:-}
      JELLYFIN_SERVER: ${JELLYFIN_SERVER:-}
      JELLYFIN_API_KEY: ${JELLYFIN_API_KEY:?JELLYFIN_API_KEY is required in .env}
      FFMPEG_HWACCEL: ${FFMPEG_HWACCEL:-auto}
      SERVER_LOCAL_DOWNLOADS_ENABLED: ${SERVER_LOCAL_DOWNLOADS_ENABLED:-true}
      SERVER_LOCAL_DOWNLOADS_MAX_GB: ${SERVER_LOCAL_DOWNLOADS_MAX_GB:-0}
      SERVER_LOCAL_DOWNLOADS_TTL_DAYS: ${SERVER_LOCAL_DOWNLOADS_TTL_DAYS:-0}
      SERVER_LOGS_RETENTION_DAYS: ${SERVER_LOGS_RETENTION_DAYS:-14}
      API_CORS_ORIGINS: ${API_CORS_ORIGINS:-}
      ORIGIN: ${ORIGIN:-http://localhost:3000}
      TZ: ${TZ:-UTC}
    volumes:
      - ${SERVER_DATA_DIR:-./data}:/data
```

With this file, keep a `.env` next to it:

```dotenv
JELLYFIN_URL=http://host.docker.internal:8096
JELLYFIN_API_KEY=your_api_key
ORIGIN=http://localhost:3000
TZ=Europe/Madrid
```

Then:

```bash
mkdir -p data
docker compose up -d
```

`stop_grace_period` gives the app 30 seconds to persist job state before the
container stops, so queued and running downloads resume after a restart.
`.env` files that still use `JELLYFIN_SERVER` keep working: it is a deprecated
alias of `JELLYFIN_URL`.

## 3. Pinned version and custom data directory

Pin an exact release for reproducible deployments and move the data directory to
a larger disk. Docker chooses `linux/amd64` or `linux/arm64` automatically.

```yaml
services:
  jellyfin-downloader:
    image: ghcr.io/angelespejo/jellyfin-downloader:0.1.0
    container_name: jellyfin-downloader
    restart: unless-stopped
    init: true
    stop_grace_period: 30s
    ports:
      - '8080:3000'
    environment:
      JELLYFIN_URL: http://192.168.1.20:8096
      JELLYFIN_API_KEY: ${JELLYFIN_API_KEY:?JELLYFIN_API_KEY is required}
      ORIGIN: http://localhost:8080
      TZ: Europe/Madrid
    volumes:
      - /mnt/media/jellyfin-downloader:/data
```

The host directory must be writable by UID 1000 (the container runs as `node`):

```bash
sudo mkdir -p /mnt/media/jellyfin-downloader
sudo chown -R 1000:1000 /mnt/media/jellyfin-downloader
```

Update by changing the tag, then `docker compose pull && docker compose up -d`.

## 4. Behind a reverse proxy

The app has no authentication, so keep the container bound to the loopback
interface and let the proxy publish it.

```yaml
services:
  jellyfin-downloader:
    image: ghcr.io/angelespejo/jellyfin-downloader:latest
    container_name: jellyfin-downloader
    restart: unless-stopped
    init: true
    stop_grace_period: 30s
    ports:
      - '127.0.0.1:3000:3000'
    environment:
      JELLYFIN_URL: http://host.docker.internal:8096
      JELLYFIN_API_KEY: ${JELLYFIN_API_KEY:?JELLYFIN_API_KEY is required}
      ORIGIN: https://downloads.example.com
      TZ: Europe/Madrid
    volumes:
      - ./data:/data
```

`ORIGIN` is used by SvelteKit for form actions and must be exactly the URL users
open (scheme, host and port).

Proxy labels for `caddy-docker-proxy`:

```yaml
labels:
  caddy: downloads.example.com
  caddy.reverse_proxy: '{{upstreams 3000}}'
```

Traefik equivalent:

```yaml
labels:
  traefik.enable: 'true'
  traefik.http.routers.jellyfin-downloader.rule: 'Host(`downloads.example.com`)'
  traefik.http.services.jellyfin-downloader.loadbalancer.server.port: '3000'
```

If the proxy runs in another container, attach both to a shared network and drop
the `ports` entry: the proxy reaches `http://jellyfin-downloader:3000` directly.

## 5. Local downloads store on a dedicated disk

The reusable store under `/data/downloads` is enabled by default, so repeated
downloads are served from disk. This example keeps it enabled, points it at a
dedicated disk and caps its size.

```yaml
services:
  jellyfin-downloader:
    image: ghcr.io/angelespejo/jellyfin-downloader:latest
    container_name: jellyfin-downloader
    restart: unless-stopped
    init: true
    stop_grace_period: 30s
    ports:
      - '3000:3000'
    environment:
      JELLYFIN_URL: http://host.docker.internal:8096
      JELLYFIN_API_KEY: ${JELLYFIN_API_KEY:?JELLYFIN_API_KEY is required}
      SERVER_LOCAL_DOWNLOADS_ENABLED: 'true'
      SERVER_LOCAL_DOWNLOADS_MAX_GB: '200'
      SERVER_LOCAL_DOWNLOADS_TTL_DAYS: '30'
      TZ: Europe/Madrid
    volumes:
      - ./data:/data
      - /mnt/media/downloads:/data/downloads
```

- `SERVER_LOCAL_DOWNLOADS_MAX_GB=0` disables the size limit;
- `SERVER_LOCAL_DOWNLOADS_TTL_DAYS=0` keeps files forever;
- the mounted directory must be writable by UID 1000;
- the cache key includes the ffmpeg version and every effective option, so
  hardware and software results do not collide.

## 6. Hardware acceleration

### VAAPI / QSV (Intel or AMD on Linux)

```yaml
services:
  jellyfin-downloader:
    image: ghcr.io/angelespejo/jellyfin-downloader:latest
    container_name: jellyfin-downloader
    restart: unless-stopped
    init: true
    stop_grace_period: 30s
    ports:
      - '3000:3000'
    environment:
      JELLYFIN_URL: http://host.docker.internal:8096
      JELLYFIN_API_KEY: ${JELLYFIN_API_KEY:?JELLYFIN_API_KEY is required}
      FFMPEG_HWACCEL: vaapi
      FFMPEG_VAAPI_DEVICE: /dev/dri/renderD128
    volumes:
      - ./data:/data
    devices:
      - /dev/dri:/dev/dri
    group_add:
      - video
      - render
```

Use `qsv` instead of `vaapi` to force Intel Quick Sync. The container user must
belong to the `video` and `render` groups on the host.

### NVIDIA NVENC

Requires the NVIDIA driver and the NVIDIA Container Toolkit on the host.

```yaml
services:
  jellyfin-downloader:
    image: ghcr.io/angelespejo/jellyfin-downloader:latest
    container_name: jellyfin-downloader
    restart: unless-stopped
    init: true
    stop_grace_period: 30s
    ports:
      - '3000:3000'
    environment:
      JELLYFIN_URL: http://host.docker.internal:8096
      JELLYFIN_API_KEY: ${JELLYFIN_API_KEY:?JELLYFIN_API_KEY is required}
      FFMPEG_HWACCEL: nvenc
    volumes:
      - ./data:/data
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]
```

VideoToolbox only exists on macOS and is not available inside the Linux
container; run the native installation there. With `FFMPEG_HWACCEL=auto` the app
probes the image at startup and falls back to software when hardware fails.

## 7. Full stack with Jellyfin

Jellyfin and the downloader on a private network; the downloader reaches Jellyfin
as `http://jellyfin:8096`, so no host gateway is needed.

```yaml
services:
  jellyfin:
    image: jellyfin/jellyfin:latest
    container_name: jellyfin
    restart: unless-stopped
    ports:
      - '8096:8096'
    volumes:
      - ./jellyfin/config:/config
      - ./jellyfin/cache:/cache
      - /mnt/media:/media:ro
    networks:
      - media

  jellyfin-downloader:
    image: ghcr.io/angelespejo/jellyfin-downloader:latest
    container_name: jellyfin-downloader
    restart: unless-stopped
    init: true
    stop_grace_period: 30s
    depends_on:
      - jellyfin
    ports:
      - '3000:3000'
    environment:
      JELLYFIN_URL: http://jellyfin:8096
      JELLYFIN_API_KEY: ${JELLYFIN_API_KEY:?JELLYFIN_API_KEY is required}
      ORIGIN: http://localhost:3000
      TZ: Europe/Madrid
    volumes:
      - ./data:/data
    networks:
      - media

networks:
  media:
```

First start, then create the API key:

```bash
docker compose up -d
# Open http://localhost:8096, finish the wizard and create an API key
# Put the key in .env as JELLYFIN_API_KEY
docker compose up -d
```

The downloader reads Jellyfin over HTTP, so it does not need access to the media
files themselves.

## Validate, update and remove

```bash
docker compose config      # validate the file and the resolved values
docker compose pull        # download the newest image for the tag
docker compose up -d       # recreate the container
docker compose ps
docker compose logs -f jellyfin-downloader
docker compose down        # stop and remove the container
```

`docker compose down` keeps bind-mounted data in `./data`. To delete everything,
remove that directory after `down`.

`docker compose config` fails when a required variable is missing, which is the
intended behaviour of the `${VAR:?message}` syntax.
