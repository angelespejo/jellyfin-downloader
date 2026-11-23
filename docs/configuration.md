# Configuration

All configuration is provided through environment variables. `.env` is ignored
by git; `.env.example` is the template.

| Variable                          | Default                | Description                                               |
| --------------------------------- | ---------------------- | --------------------------------------------------------- |
| `JELLYFIN_URL`                    | —                      | Jellyfin base URL                                         |
| `JELLYFIN_SERVER`                 | —                      | Deprecated alias of `JELLYFIN_URL`                        |
| `JELLYFIN_API_KEY`                | —                      | Server-side Jellyfin API key                              |
| `FFMPEG_PATH`                     | auto                   | ffmpeg binary or directory                                |
| `FFMPEG_CANDIDATES`               | —                      | Extra paths separated by the OS delimiter                 |
| `FFMPEG_HWACCEL`                  | `auto`                 | `auto`, `none`, `videotoolbox`, `nvenc`, `qsv` or `vaapi` |
| `FFMPEG_VAAPI_DEVICE`             | `/dev/dri/renderD128`  | VAAPI/QSV render device                                   |
| `SERVER_LOCAL_DOWNLOADS_ENABLED`  | `true`                 | Reuse and keep finished downloads                         |
| `SERVER_LOCAL_DOWNLOADS_DIR`      | `./data/downloads`     | Output store directory                                    |
| `SERVER_LOCAL_DOWNLOADS_MAX_GB`   | `0`                    | Optional size limit                                       |
| `SERVER_LOCAL_DOWNLOADS_TTL_DAYS` | `0`                    | Optional TTL                                              |
| `SERVER_SETTINGS_FILE`            | `./data/settings.json` | Global settings file                                      |
| `SERVER_JOBS_DIR`                 | `./data/jobs`          | Durable job state                                         |
| `SERVER_LOGS_DIR`                 | `./data/logs`          | Persisted JSONL application logs                          |
| `SERVER_LOGS_RETENTION_DAYS`      | `14`                   | Log retention; `0` keeps logs indefinitely                |
| `API_CORS_ORIGINS`                | —                      | CORS allowlist, comma-separated                           |
| `ORIGIN`                          | —                      | Public URL behind a reverse proxy                         |

## ffmpeg resolution

1. `FFMPEG_PATH` if set.
2. Paths from `FFMPEG_CANDIDATES`.
3. Common locations (`/usr/bin`, `/usr/local/bin`, `/opt/homebrew/bin`,
   `/snap/bin`, jellyfin-ffmpeg).
4. Directories from `PATH`.

The selected binary is validated with `ffmpeg -version`; encoders, filters and
hardware acceleration methods are probed to hide unsupported options.

## Hardware acceleration

`FFMPEG_HWACCEL=auto` uses the first available path: VideoToolbox on macOS,
then NVENC, QSV and VAAPI on Linux/Windows. VAAPI and QSV require access to the
configured render device. Detection only enables the option in the UI; each
download can disable it, and a failed hardware encode is retried once in
software. If the environment variable names a mode that is unavailable, the
download uses software.

In Docker, pass `/dev/dri` and the `video`/`render` groups for VAAPI/QSV.
NVENC additionally needs the host NVIDIA driver and container toolkit.

## Settings file

`SERVER_SETTINGS_FILE` is a JSON document containing:

- global defaults;
- presets;
- a revision for optimistic concurrency;
- `updatedAt`.

The file is validated, written atomically and backed up as `.bak`. It contains
no secrets. Presets have a `tags` array; presets without it are normalized to
`["default"]`. Tags can be filtered through `GET /api/v1/presets?tag=...`.
`/settings` edits it through the API.

## Cookies

| Cookie           | Values                    | Purpose     |
| ---------------- | ------------------------- | ----------- |
| `jd_locale_mode` | `auto`, `en`, `es`, `ca`  | UI language |
| `jd_theme`       | `system`, `light`, `dark` | UI theme    |

Cookies are set by the header selectors and read by `hooks.server.ts`, so the
server-rendered HTML already has the right `lang` and `data-theme` attributes.

## Logs

Meaningful server events are appended as JSONL to
`SERVER_LOGS_DIR/YYYY-MM-DD.jsonl`: startup and shutdown, settings creation and
changes, Jellyfin connectivity, restored jobs, download jobs, cache hits,
hardware fallbacks, deleted local downloads and internal errors. The logger
redacts keys such as `apiKey`, `token`, `authorization`, `password`, `path` and
`secret`; it never stores the Jellyfin API key or absolute server paths. Files
are removed after `SERVER_LOGS_RETENTION_DAYS` (14 by default).

Logs are available in **Settings → Logs** and through:

```text
GET  /api/v1/logs?level=&limit=200&date=YYYY-MM-DD
GET  /api/v1/logs?download=1[&date=YYYY-MM-DD]
DELETE /api/v1/logs[?date=YYYY-MM-DD]
```

## Local downloads

The store is enabled by default. The layout is:

```text
<SERVER_LOCAL_DOWNLOADS_DIR>/objects/<2 hex>/<sha256>/
├── output.<ext>
└── meta.json
```

The key includes the app plan version, ffmpeg version, movie/source fingerprint,
every effective download option and the final filename. Hardware acceleration
is not part of the key: software and hardware results are interchangeable for
the same logical configuration. New entries store movie, series and episode
metadata plus the preset and effective options used, so the UI can show
per-title counts, filter by series and replicate a download configuration;
legacy entries without it remain listed but are not counted. When disabled,
working files remain in a temporary directory and are not reused.

Output files are named `Title (year) - Preset.ext`, or
`Title (year) - custom.ext` for an un-preset configuration. Episodes include the
series and `S01E02` code. The extension follows the selected container or is
`.zip` for multi-file results.
