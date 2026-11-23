# API v1

Base path: `/api/v1`. The UI uses exactly this API.

> **No authentication.** Anyone with network access can use it. Protect it with
> a reverse proxy or VPN. CORS is disabled by default; `API_CORS_ORIGINS` can
> allow specific origins.

OpenAPI 3.1: `GET /api/v1/openapi.json`. Human-readable page: `GET /api/v1/docs`.

## Flow

1. `GET /movies` to obtain IDs and metadata for movies, series and home videos.
2. `GET /series/{id}` to list the episodes of a series.
3. `GET /movies/{id}` to inspect sources and tracks of a playable item.
4. `POST /downloads` to create the job.
5. Poll `GET /downloads/{id}` until `ready` or `failed`.
6. `GET /downloads/{id}/file` to download the result.

## Endpoints

| Method | Path                                                 | Description                                   |
| ------ | ---------------------------------------------------- | --------------------------------------------- |
| GET    | `/health`                                            | Configuration, ffmpeg, local store and uptime |
| GET    | `/capabilities`                                      | Containers, codecs, hardware, burn-in, limits |
| GET    | `/movies?q=&limit=&offset=`                          | Jellyfin native search with pagination        |
| GET    | `/movies/{id}`                                       | Playable item details with sources and tracks |
| GET    | `/series/{id}`                                       | Series details with available episodes        |
| GET    | `/series/{id}/size`                                  | Total size of the available episodes          |
| GET    | `/artwork/{id}?w=160\|300\|600`                      | Proxied poster                                |
| POST   | `/downloads`                                         | Create download                               |
| GET    | `/downloads?state=&limit=`                           | List active jobs or every retained job        |
| POST   | `/downloads/batch`                                   | Create several downloads with one config      |
| GET    | `/downloads/{id}`                                    | State and progress                            |
| GET    | `/downloads/{id}/file`                               | Final file; supports `Range`                  |
| DELETE | `/downloads/{id}`                                    | Cancel a queued, running or paused job        |
| POST   | `/downloads/{id}/pause`                              | Pause a queued or running job                 |
| POST   | `/downloads/{id}/resume`                             | Resume a paused job                           |
| POST   | `/downloads/{id}/restart`                            | Restart a paused, failed or cancelled job     |
| GET    | `/local-downloads?movieId=&seriesId=&limit=&offset=` | Page of stored local downloads                |
| GET    | `/local-downloads/count?movieId=&seriesId=`          | Stored download count for an item/series      |
| GET    | `/local-downloads/{key}`                             | Stored download metadata and configuration    |
| GET    | `/local-downloads/{key}/file`                        | Download a stored result                      |
| DELETE | `/local-downloads/{key}`                             | Delete a stored result                        |
| POST   | `/local-downloads/check`                             | Check whether a configuration exists          |
| GET    | `/presets?tag=`                                      | List presets; repeatable tag filter (AND)     |
| GET    | `/presets/{id}`                                      | Get one preset                                |
| GET    | `/logs?level=&limit=&offset=&date=`                  | Read persisted server logs                    |
| GET    | `/logs?download=1`                                   | Download a JSONL log file                     |
| DELETE | `/logs[?date=]`                                      | Clear persisted logs                          |
| GET    | `/settings`                                          | Defaults and presets                          |
| PUT    | `/settings`                                          | Save global settings                          |

## Catalog search and series

`GET /movies?q=` uses Jellyfin's native `SearchTerm` with pagination, so it
returns results without downloading the whole catalog. Items do not include
media sources; call `/movies/{id}` before creating a download.

`GET /series/{id}` returns lightweight episodes (no media sources) and
`unavailableEpisodes` for virtual/placeholder entries that are not on the
server. Those entries are excluded from the list and cannot be downloaded.
`GET /series/{id}/size` computes the total size of the available episodes and
may take longer than the series call; the UI shows a loading state.

## Create a download

```json
{
  "movieId": "11111111111111111111111111111111",
  "mediaSourceId": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "preset": "mp4-480p",
  "options": {
    "container": "mp4",
    "quality": "480p",
    "videoCodec": "h264",
    "audioCodec": "aac",
    "audioSelection": "all",
    "audioStreamIndices": [1],
    "audioPackaging": "mux",
    "subtitleSelection": "all",
    "subtitleStreamIndices": [2, 3],
    "subtitleStrategy": "mirror-source",
    "subtitlePackaging": { "3": "separate" },
    "hardwareAcceleration": true
  }
}
```

- `movieId` is required. `mediaSourceId` is optional; the first source is used.
- `quality` accepts `original`, `2160p`, `1440p`, `1080p`, `720p`, `480p` or
  `360p`. It is a cap: the server never upscales above the source resolution.
- For series, use an episode ID returned by `GET /series/{id}`; a series ID is
  rejected with `SERIES_NOT_DOWNLOADABLE`.
- `preset` applies a global preset; `options` overrides it.
- `hardwareAcceleration` defaults to `true` when the server exposes a hardware
  encoder. `false` forces software encoding.
- `audioSelection`/`subtitleSelection`: `"all"`, `"default"`, `"none"` or
  `{ "languages": ["spa"] }`.
- Explicit `audioStreamIndices`/`subtitleStreamIndices` take precedence.
- `subtitlePackaging` overrides packaging per stream.
- `subtitleStrategy`: `mirror-source`, `muxed`, `separate`, `burn`, `none`.
- `audioPackaging`: `mux` or `separate`.

Response `202` (or `200` when already cached):

```json
{
  "id": "c3d41a93-14df-4770-bd01-145e9a9c9474",
  "state": "running",
  "stage": "preparing",
  "progress": 0.01,
  "queuePosition": null,
  "cached": false,
  "stored": false,
  "expectedFiles": 2,
  "output": null,
  "error": null,
  "errorCode": null,
  "createdAt": "2026-11-20T17:03:18.207Z",
  "updatedAt": "2026-11-20T17:03:18.207Z"
}
```

`Location` points to the status endpoint. `Retry-After: 1` is sent while the
job is not ready. When ready, `output.downloadUrl` contains the final file URL.

If an active job already exists for the same configuration, that job is
returned.

## Batch downloads

`POST /downloads/batch` creates several jobs with one configuration:

```json
{
  "movieIds": ["55555555555555555555555555555555", "66666666666666666666666666666666"],
  "preset": "mp4-480p",
  "options": { "audioSelection": "all", "subtitleSelection": "all" }
}
```

It accepts up to 50 unique playable item IDs. Explicit stream indices are
rejected with `INVALID_BATCH_OPTIONS`; use `audioSelection`/`subtitleSelection`
strategies instead. The response is `202`:

```json
{ "jobs": [], "errors": [{ "movieId": "...", "code": "QUEUE_FULL", "message": "..." }] }
```

Valid items are queued independently; one failure does not cancel the rest.

Output filenames are generated automatically as `Title (year) - Preset.ext`,
or `Title (year) - custom.ext` when no preset was used.

## States

- `queued`, `running`, `paused`, `ready`, `failed`, `cancelled`.
- Stages: `preparing`, `downloading-source`, `downloading-subtitles`,
  `processing-video`, `extracting-audio`, `extracting-subtitles`, `packaging`,
  `finalizing`.
- `progress` is `0..1` or `null`.
- `title`, `filename`, `movieId`, `seriesId` and `sourceSizeBytes` identify the
  job and its original weight without extra requests.
- `processingMs` is the active processing time (source download plus ffmpeg),
  excluding queue wait and server downtime.
- `config` is the effective preset/options used by the job.
- `cached` means the result existed in the local store before this request.
- `stored` means the result is kept for reuse.
- `output.kind`: `file` or `zip`.
- `expectedFiles`: number of files in the ZIP (1 for a single file).
- `errorCode` is a stable code; the UI maps it to a localized message.

## Queue

`GET /downloads?state=active&limit=50` returns `{ jobs, total, active }` with
queued, running and paused jobs, ordered by queue position and then by update
time. `state=all` includes finished jobs retained by the server. Use
`DELETE /downloads/{id}` to cancel.

## Pause, resume and restart

- `POST /downloads/{id}/pause` stops a queued or running job, freezes its
  `processingMs` and keeps its work directory. The next queued job can start.
- `POST /downloads/{id}/resume` puts the job back at the end of the queue. A
  partial original file is continued with an HTTP `Range` request when Jellyfin
  supports it. Completed ffmpeg steps are reused; only the step that was running
  when the job was paused starts again.
- `POST /downloads/{id}/restart` discards the work directory and starts the same
  job from scratch. It is available for paused, failed and cancelled jobs.
- Paused jobs survive a server restart and are kept for 7 days. Creating the same
  download again resumes the paused job instead of duplicating it.

## Logs pagination

`GET /logs?limit=100&offset=0` returns `{ entries, total, limit, offset, hasMore }`.
Entries are ordered newest first; `offset` skips already loaded entries. Level and
date filters apply before counting.

## Download

`GET /downloads/{id}/file` returns the final file with `Content-Type`,
`Content-Length`, `Content-Disposition`, `Accept-Ranges: bytes` and `Range`
support (206/416). It is available when `state=ready`.

## Local downloads

`GET /local-downloads` returns a page of stored files with `filename`, `sizeBytes`, `sourceSizeBytes`, `processingMs`, `createdAt`, `kind`, optional movie/series metadata, `config` and a stable `downloadUrl`. `config` contains the preset and effective options used; it is `null` for legacy entries. Use `?movieId=` for one playable item or `?seriesId=` for every episode of a series. Use `limit` (default 20, maximum 100) and `offset` for pagination; the response includes `total`, `limit`, `offset`, `usedBytes` and `objects`. The server never exposes an absolute filesystem path.

`GET /local-downloads/{key}` returns the same metadata for one entry. The UI uses it to replicate a download configuration.

`GET /local-downloads/{key}/file` serves the stored file with `Range` support. `DELETE /local-downloads/{key}` removes it; send `Content-Type: application/json` because SvelteKit rejects form-like cross-site mutations.

## Check the local store

`POST /local-downloads/check` accepts the same body as `POST /downloads`:

```json
{
  "enabled": true,
  "hit": true,
  "key": "8e68aad64c44c82f90923612ab05bfb8eb00a5fa3a130cf23be8d47dcb258024",
  "sizeBytes": 1587481,
  "createdAt": "2026-11-20T17:03:18.292Z",
  "filename": "The General (1926) - Original.zip",
  "kind": "zip"
}
```

The server recalculates the key from real Jellyfin metadata. Hardware
acceleration does not change the key.

## Presets and tags

Every preset has `tags: string[]`. A preset without tags is stored with
`["default"]`, and the UI can edit them as a comma-separated list. Tags are
lowercase slugs (letters, numbers and hyphens).

`GET /presets` returns the global presets:

```json
{
  "presets": [{ "id": "mp4-1080p", "name": "MP4 1080p", "tags": ["default"], "options": {} }],
  "total": 1,
  "tags": ["default", "mobile"],
  "warning": null
}
```

Use `?tag=default`, `?tag=mobile`, repeated `?tag=` parameters or a
comma-separated value. Presets must contain **all** requested tags. The
response `tags` field lists every tag available in the store. `GET
/presets/{id}` returns `{ preset }` or `404 PRESET_NOT_FOUND`.

## Logs

`GET /logs` returns recent structured entries and the retention window:

```json
{
  "entries": [
    {
      "id": "…",
      "timestamp": "2026-11-21T20:00:00.000Z",
      "level": "info",
      "event": "job.ready",
      "message": "Download ready: The General (1926) - MP4 480p.mp4",
      "context": { "movieId": "…", "filename": "…" }
    }
  ],
  "total": 1,
  "date": null,
  "retentionDays": 14
}
```

Use `?level=error`, `?date=YYYY-MM-DD` and `?limit=200`. `?download=1` returns
the selected day's JSONL file. `DELETE /logs` clears all logs; `?date=` clears
one day. Send `Content-Type: application/json` on DELETE. Logs never include the
Jellyfin API key or absolute server paths.

## Settings

`GET /settings` returns `{ settings, warning }`. `PUT /settings` accepts the
full document and uses `revision` for optimistic concurrency. A stale revision
returns `409 SETTINGS_CONFLICT`. Writes are atomic and contain no secrets.

## Errors

```json
{
  "error": {
    "code": "INCOMPATIBLE_SUBTITLE",
    "message": "Subtitle pgssub cannot be integrated into MP4; separate it or use MKV"
  }
}
```

Common codes: `INVALID_REQUEST`, `INVALID_JSON`, `UNSUPPORTED_MEDIA_TYPE`,
`BODY_TOO_LARGE`, `MOVIE_NOT_FOUND`, `JELLYFIN_ERROR`, `INVALID_OPTIONS`,
`COPY_CANNOT_SCALE`, `INCOMPATIBLE_VIDEO_COPY`, `INCOMPATIBLE_AUDIO_COPY`,
`INCOMPATIBLE_SUBTITLE`, `BURN_ONE_ONLY`, `BURN_REQUIRES_ENCODE`,
`BURN_UNSUPPORTED`, `ENCODER_UNAVAILABLE`, `SERIES_NOT_DOWNLOADABLE`,
`NOT_A_SERIES`, `BATCH_TOO_LARGE`, `INVALID_BATCH_OPTIONS`, `QUEUE_FULL`, `JOB_NOT_FOUND`,
`JOB_NOT_READY`, `JOB_FINISHED`, `FFMPEG_UNAVAILABLE`, `SETTINGS_INVALID`,
`SETTINGS_CONFLICT`, `OUTPUT_MISSING`, `INTERNAL_ERROR`.

Messages are English; the web UI translates known codes.

## CORS

Set `API_CORS_ORIGINS` to a comma-separated list. `*` allows any origin; use it
only on trusted networks. Allowed methods: `GET, POST, PUT, DELETE, OPTIONS`.
Exposed headers: `Content-Disposition`, `Content-Range`, `Content-Length`,
`Accept-Ranges`, `Retry-After`.

## Limits

- Queue: 20 jobs; ffmpeg concurrency: 1.
- JSON body: 64 KiB (settings: 256 KiB).
- External subtitles: 30 MiB.
- No rate limiting or authentication; use a proxy if needed.
