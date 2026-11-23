# Jobs and persistence

Download jobs are durable. Each job has a JSON file in `SERVER_JOBS_DIR`
(default `./data/jobs`) and remains addressable by its `jobId` across restarts.

## Persisted fields

- normalized plan (item, source, options, cache key, expected files);
- state, stage, progress;
- output path/name/kind/size/content type;
- `error` and stable `errorCode`;
- working directory;
- whether the source download is complete, its bytes and expected length;
- timestamps and attempt count.

The plan records the selected hardware encoder and the software fallback. The
cache key describes the logical output and does not include the hardware
encoder, so cached results are reused across hardware and software runs.

The state file contains no Jellyfin API key and no credentials. It is written
atomically (temporary file + rename) with mode `0600`.

## Recovery after restart

On startup the job manager loads all state files:

- `queued`: re-queued in creation order.
- `running`: re-queued as a resumed job.
- `ready`: restored if the output file still exists; otherwise marked
  `failed` with `OUTPUT_MISSING`.
- `failed`/`cancelled`: kept until the TTL cleanup.

Before re-queuing, the local store is checked. If the output already exists
under the plan cache key, the job becomes `ready` without reprocessing.

During resume:

- a complete source file is reused (size is checked when known);
- a partial source is removed and downloaded again;
- external subtitles already on disk are reused;
- partial ffmpeg outputs (`video.*`, `audio-*`, `subtitle-*`, `burn-*`,
  `output.zip`) are removed;
- the current ffmpeg step restarts from the last completed stage.

Exact mid-ffmpeg resumption is not possible without segmenting the pipeline.
The job itself is never lost.

## Hardware fallback

If a hardware encode fails to initialize or run, the job keeps the downloaded
source and external subtitles, removes partial video/burn outputs, switches the
persisted plan to the software encoder and retries the processing steps once.
A second failure is reported as `FFMPEG_ERROR`.

## Batch jobs

`POST /api/v1/downloads/batch` validates up to 50 playable items and creates one
job per item with the same preset/options. Each job keeps its own cache key,
filename and stored configuration. Per-item validation or queue errors are
returned without cancelling the valid jobs.

## Logs

Jobs write structured events to `SERVER_LOGS_DIR`: creation, cache hits, ready,
failed, cancelled, hardware fallback, batch summaries and deletion of local
results. Progress updates are not logged to avoid noisy files.

## Shutdown and cancellation

Graceful shutdown:

- persists every active job as queued/preparing;
- kills child ffmpeg processes;
- keeps the working directory for the next start;
- does **not** mark jobs as cancelled.

User cancellation is different: it marks the job `cancelled`, removes queued
work and cleans up the working directory.

## Storage assumptions

- One application instance per `SERVER_JOBS_DIR`.
- The directory must be writable by the app user.
- In Docker, `./data:/data` keeps jobs across container restarts.
- With `SERVER_LOCAL_DOWNLOADS_ENABLED=false`, a Docker restart may lose the
  temporary working directory; the job still resumes by downloading the source
  again. The store is enabled by default.
