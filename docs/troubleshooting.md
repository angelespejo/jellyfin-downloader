# Troubleshooting

## Jellyfin connection fails

Check `JELLYFIN_SERVER` (include the port and any base path), the API key and
network access from the container/host. `/api/v1/health` reports configuration
state; it intentionally does not call Jellyfin.

## ffmpeg is unavailable

- Set `FFMPEG_PATH` to the binary or its directory.
- Ensure the binary is executable.
- `ffmpeg -version`, `ffmpeg -encoders` and `ffmpeg -filters` must work.
- In Docker the binary is `/usr/bin/ffmpeg`.

## Burn-in is unavailable

The `subtitles` filter requires libass. The UI reads capabilities and disables
burn-in when missing. Use the Docker image (Debian ffmpeg with libass) or a
custom ffmpeg build. Bitmap subtitles (PGS/VobSub) cannot be burned without OCR.

## Hardware acceleration is not offered

- Check `ffmpeg -hwaccels` and `ffmpeg -encoders` for VideoToolbox, NVENC, QSV or
  VAAPI encoders.
- VAAPI/QSV need a readable/writable render device (`FFMPEG_VAAPI_DEVICE`).
- In Docker, pass `/dev/dri` and the `video`/`render` groups.
- Set `FFMPEG_HWACCEL=none` to force software; `auto` is the default.
- If an encoder is listed but unusable, the job retries once in software.

## A series has no episodes

The catalog loads series from Jellyfin and episodes lazily from
`/Shows/{id}/Episodes`. Check that the API key can read the series and that the
episodes are not hidden or missing media sources.

## A download finishes with a failure

Open the job status and `errorCode`; server logs contain the ffmpeg stderr tail.
Common causes:

- incompatible container/codec copy (choose MKV or re-encode);
- bitmap subtitle integrated into MP4;
- insufficient disk space;
- source stream unavailable from Jellyfin.

## Logs are empty

- Ensure `SERVER_LOGS_DIR` is writable by the app user.
- Set `SERVER_LOGS_RETENTION_DAYS=0` to disable automatic deletion.
- Logs record meaningful server events, not every progress tick or client-only
  form validation.

## Settings conflict (409)

Another tab changed the settings file. Reload `/settings` and save again. The
server uses `revision` to prevent silent overwrites.

## A job does not resume after restart

- Ensure `SERVER_JOBS_DIR` is persistent and shared across restarts.
- In Docker, mount `./data:/data`.
- Check that the app user can read/write the directory.
- With local downloads disabled, temporary files may be gone; the job will
  download the source again.

## Language/theme does not change

Cookies `jd_locale_mode` and `jd_theme` must be allowed by the browser. Clear
them to return to automatic language/system theme.

## Slow first run

`pnpm dev` downloads public-domain fixtures the first time. Later runs reuse
`.dovenv/dev/fixtures` and start immediately.
