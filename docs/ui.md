# User interface

## Library browser

`/` is a full-width Jellyfin browser for movies, series and home videos:

- centered search field, reflected in the URL as `?q=` (debounced, `replace`
  history);
- server-side search with pages of 48 results and infinite scroll (plus a visible
  **Load more** button); search uses Jellyfin's native terms instead of loading
  the whole catalog;
- an initial empty state until the user types a query — no cards are rendered
  before searching;
- a distinct no-results state when the search has no matches;
- responsive poster grid (`auto-fill` columns, two columns on phones);
- minimal cards: poster, media-type badge (movie/series/home video), title, year,
  a floating local-download count badge and an active-queue badge (clock icon and
  count, with a native tooltip);
- selecting a poster opens a media dialog instead of navigating away;
- the open dialog is reflected in the URL as `?modal=<Jellyfin item id>`, so it
  can be linked directly and reopened with browser navigation.

Local downloads link back to the same dialog through `/?modal=<item id>`; this
works for movies, home videos and episodes, including episodes that are not in
the initial catalog page.

The modal is portaled to `document.body` so its backdrop covers the full
viewport and paints above the sticky header and footer.

`MovieDialog` is a reusable `ModalShell` dialog with three sticky tabs:

- **Details** — poster, title with year, runtime and selected-version size; media
  badges with tooltips; a **Play in Jellyfin** link; source selector; collapsible
  output, audio and subtitle sections; select/deselect-all controls for audio and
  subtitles; local-store status; download button, generated filename and job
  progress (with cancel and processing time). Episode URLs update to
  `?modal=<episodeId>` and keep a back button to the series.
- **Downloads (N)** — local results for that movie, home video or episode, with
  size, date, download link, configuration badge and a styled delete
  confirmation. A series lists downloads for all of its episodes.
- **Queue (N)** — active downloads for this movie or episode; on a series list it
  shows every episode of that series. Each row shows stage, progress or queue
  position, original size, configuration badge/popover and a cancel action; the
  title opens that item in the dialog.

The tabs remain pinned below the modal title while the body scrolls. Output
files are named `Title (year) - Preset.ext`, or `Title (year) - custom.ext`
without a preset; episodes include `S01E02`. Qualities are caps: the app never
upscales. If the source is lower than the selected quality, the output keeps
the source resolution and the dialog shows a short notice. The info icon next
to each field opens its description on click or tap and shows the same text as
a native tooltip on hover/focus.

Series cards open an episode list grouped by season. Seasons are collapsed by
default and load their rows when opened. Virtual episodes that are not backed by
a file are excluded and reported as unavailable. The series total size is
calculated in the background with a visible loading state. A **Download
episodes** action enables compact episode/season checkboxes, select-all/clear
controls and a single configuration screen for the whole selection. Selecting one
episode loads the normal detail flow with a back button. `OutputSettings` exposes
a hardware-acceleration checkbox when the server detects a compatible GPU
encoder; it is enabled by default.

The dialog traps focus, closes on Escape or backdrop click, animates open/close,
and returns focus to the card.

## Notifications

- Global toasts appear above the interface for downloads, deletions, settings
  changes, batch creation and errors.
- They can be closed manually, auto-dismiss, and use `aria-live`/`role` for
  assistive technology.
- Persistent server logs are available in **Settings → Logs**; toasts are the
  visible layer for the same kinds of events.

## Downloads

`/downloads` shows a **Downloading now** section above the stored files:

- active jobs with title, filename, stage, progress bar or queue position, plus
  the original source size; clicking the title opens the media dialog;
- cancel action with a styled confirmation dialog;
- when a job finishes it leaves the queue and the stored list refreshes
  automatically.
  The stored section lists every object in the server local store:

- filename and optional movie/year;
- a link back to the media dialog (`/?modal=<item id>`) when the Jellyfin item
  is known;
- size, original source size, processing time, date, type and a preset/custom
  configuration badge;
- a hover/focus popover with the exact configuration and a **Replicate**
  action that opens the dialog prefilled through `?modal=<id>&from=<key>`;
- stable download URL;
- delete action with a styled confirmation dialog.

No absolute server path is exposed. If the store is disabled, the page explains
which environment variable enables it.

## Settings

`/settings` uses accessible tabs:

- **Appearance** — language and theme.
- **Defaults** — output defaults with help text.
- **Presets** — list, create, edit and delete presets, including their tags.
- **Storage** — local-store status and a link to `/downloads`.
- **Logs** — filter, inspect, download and clear persisted server logs, with
  infinite scroll and a visible **Load more** fallback.

Preset creation/editing uses a modal (`ModalShell`) so the page stays compact.
Tags are entered as a comma-separated list and default to `default`. Deleting a
preset asks for confirmation in a reusable `ConfirmDialog` instead of the
browser's native `confirm()`. Language and theme selectors live only here; the
header contains navigation and the app icon.

## Footer

The footer is shared by every page and shows:

- ffmpeg availability and version (or an unavailable badge);
- local-store status and used size, linked to `/downloads`;
- app version, API docs, OpenAPI schema and the API base path;
- a **Project info** button that opens an accessible modal with the project
  description, author, funding, license, repository, runtime details and the
  main API endpoints.

Capabilities and storage status are loaded once in `+layout.server.ts`.

## Motion and accessibility

- The header navigation and tab strips scroll horizontally on narrow screens
  without showing a scrollbar.
- A very subtle accent/blue glow animates slowly behind the page; it is
  disabled under `prefers-reduced-motion`.
- Buttons and badge links use the reusable `.hover-shine` class for the hover
  sweep; movie cards deliberately do not use it.
- Movie cards use the reusable `.card-border-flash` class for the animated
  border shimmer on hover/focus; download cards lift slightly with an accent
  border and soft shadow.
- Modals, popups, toasts and the sticky header use translucent backgrounds with
  backdrop blur.
- Field descriptions expand with a short slide animation and respect
  `prefers-reduced-motion`.
- Modals fade/scale in and out; tab panels animate in.
- Page navigation uses the View Transitions API when available.
- All animations are disabled under `prefers-reduced-motion: reduce`.
- Real buttons and links, translated labels, visible focus, a skip link,
  `inert` background content while a modal is open, and keyboard navigation are
  used throughout.
- Tab lists support Left/Right/Home/End keys.

## Shared components

Generic primitives live in `src/lib/components`:

- `Icon` — inline SVG icon set, no dependency;
- `ModalShell` — focus-trapped, animated dialog;
- `ConfirmDialog` — styled destructive confirmation;
- `Tabs` — accessible tab list;
- `CollapsibleSection` — accessible disclosure section;
- `Field` — label, control and description;
- `EmptyState`.

App-specific components live in `src/lib/ui`:

- `MovieItem`, `MovieDialog`, `OutputSettings`, `JobPanel`, `BatchPanel`,
  `DownloadQueue`.

`OutputSettings` is shared by the movie dialog and the preset editor.

## Theme and language

- Theme is applied as `data-theme` on `<html>` and stored in cookie `jd_theme`.
- Language is stored in `jd_locale_mode`; the server renders the correct
  `lang` and the client updates without a reload.
- System theme is the default and follows `prefers-color-scheme`.
