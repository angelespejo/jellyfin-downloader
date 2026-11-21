# Theming and visual style

The palette and typography follow the Jellyfin Atlas reference project.

## Tokens

`src/app.css` defines light and dark tokens:

- `--bg`, `--surface`, `--surface-2`, `--text`, `--muted`, `--line`;
- `--accent` (Jellyfin purple), `--accent-strong`, `--accent-soft`;
- `--danger`, `--success`, `--warning` and their soft variants;
- `--radius`, `--shadow`, `--focus-ring`.

Use tokens rather than hardcoded colours so both themes stay consistent.

## Themes

- Modes: **System**, **Light**, **Dark**.
- Default: System.
- Stored in cookie `jd_theme` and applied as `data-theme` on `<html>`.
- System uses `@media (prefers-color-scheme: dark)` with
  `:root[data-theme='system']`.
- `hooks.server.ts` replaces `%theme%` in `app.html`, avoiding a flash of the
  wrong theme.
- `src/core/theme.svelte.ts` updates the attribute and cookie immediately.

## Typography

Plus Jakarta Sans is served locally from `static/fonts/` with the OFL licence.
No remote fonts or CDNs are used.

## Favicon

`static/favicon.ico` and `static/jellyfin-icon.svg` are the official Jellyfin
UX assets from `jellyfin/jellyfin-ux` (CC BY-SA 4.0). Attribution and trademark
notice are in `static/jellyfin-icon.LICENSE.txt`. This is a third-party project
and not an official Jellyfin client.

## Rules

- Do not introduce Tailwind or a UI framework.
- Keep contrast valid in both themes.
- Use `:focus-visible` and the shared focus token.
- Respect `prefers-reduced-motion` for animations.
- Keep component CSS scoped and token-based.
