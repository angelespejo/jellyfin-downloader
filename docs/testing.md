# Testing

## Unit tests

```bash
pnpm test
```

Tests use `node:test` through `tsx` and live in `tests/unit`:

- `files.test.ts` — filename sanitization, content disposition and Range parsing;
- `i18n.test.ts` — locale detection (English/Spanish/Catalan/other), modes,
  interpolation and error translation;
- `job-store.test.ts` — atomic persistence, restore, corrupt files and cleanup;
- `logging.test.ts` — log level/event validation, message sanitization and
  secret/path redaction;
- `media.test.ts` — item kind mapping, episode codes/titles, series details;
- `plan.test.ts` — source mirroring, packaging modes, codec/container
  validation, burn-in constraints, hardware selection/fallback, 2160p/1440p
  scaling caps and cache-key stability;
- `presets.test.ts` — preset tag normalization, defaults and comma-separated
  input;
- `zip.test.ts` — ZIP creation, UTF-8 names, ZIP structure and `unzip -t`.

## Type checks

```bash
pnpm check
pnpm check:ts-only
```

`pnpm check` runs SvelteKit sync and `svelte-check` for the whole project.
`pnpm check:ts-only` rejects hand-written JavaScript and untyped Svelte scripts.

## Lint and format

```bash
pnpm lint
pnpm lint:fix
pnpm format
pnpm format:check
```

## Build

```bash
pnpm build
```

The Node output can be verified without development dependencies:

```bash
cp -R build /tmp/jellyfin-downloader-build
cp package.json /tmp/jellyfin-downloader-build/
cd /tmp/jellyfin-downloader-build
JELLYFIN_URL=http://127.0.0.1:8096 \
JELLYFIN_API_KEY=dev-key \
node build
```

## Manual smoke test

```bash
pnpm dev
```

Then verify:

1. the page shows a search prompt and no cards before a query;
2. typing a query updates `?q=` in the URL and shows matching movies, series
   and home videos;
3. cards show only poster, title, year and the floating download badge;
4. the search field is centered and clearing it hides the cards again;
5. a series card lists episodes grouped by season and an episode opens the
   normal detail view with a back button;
6. detail view with media badges, audio/subtitle tracks and source selection;
7. dialog tabs: details and downloads, including download links and deletion
   with the styled confirmation dialog;
8. dialog open/close animations, Escape/backdrop close and focus return;
9. default mirror output and an episode output named `Series S01E02 - Episode`;
10. a preset such as `mp4-480p` and the five factory presets on a fresh install;
11. quality 2160p/1440p, and the no-upscale notice when the source is smaller;
12. the info icon on fields opens help on click, works with keyboard and shows
    the native tooltip;
13. hardware acceleration toggle when available; unchecking it uses the
    software encoder, and a failing hardware run falls back to software;
14. cache-hit behavior and the download count badge;
15. `/downloads` listing, stable file URL and deletion through the styled
    confirmation dialog (not the native browser dialog);
16. settings tabs, appearance, defaults, the preset modal, preset tags,
    deletion confirmation and the Logs tab;
17. `GET /api/v1/presets?tag=default` and `GET /api/v1/presets/{id}`;
18. global toasts for download, delete and settings actions; logs contain the
    matching server events and can be filtered, downloaded and cleared;
19. output names use `Title (year) - Preset.ext` or `- custom.ext`;
20. downloads show the configuration badge/popover and **Replicate** restores
    the preset and options in the dialog;
21. a series selection creates one batch with one configuration and shows
    per-episode progress/download links;
22. the footer **Project info** button opens the project/API modal and Escape
    closes it;
23. the modal backdrop covers the header/footer and background content is
    `inert`;
24. the dialog URL is `?modal=<id>`; refresh and browser back/forward reopen or
    close it;
25. a download title opens the same dialog through `/?modal=<id>`, including
    episode downloads;
26. the field info icon animates the help text and the underline effect does
    not linger after leaving links or buttons;
27. the skip link appears on first Tab and jumps to the main content;
28. `axe` WCAG 2.2 A/AA checks report no violations on the home, dialog,
    downloads, settings, logs, batch and project-info views;
29. the footer shows ffmpeg/local-store status, version and API links;
30. language switching (English/Spanish/Catalan) from Settings;
31. theme switching (System/Light/Dark) from Settings;
32. reduced motion: enable `prefers-reduced-motion` and confirm popups and page
    transitions are effectively instant;
33. restart persistence: start a download, restart the app with the same
    `SERVER_JOBS_DIR`, and confirm the job resumes.
