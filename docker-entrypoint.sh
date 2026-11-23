#!/bin/sh
set -eu

PUID="${PUID:-1000}"
PGID="${PGID:-1000}"

case "$PUID" in
  '' | *[!0-9]*)
    echo "[entrypoint] PUID must be a numeric user id" >&2
    exit 1
    ;;
esac
case "$PGID" in
  '' | *[!0-9]*)
    echo "[entrypoint] PGID must be a numeric group id" >&2
    exit 1
    ;;
esac

if [ "$(id -u)" = "0" ]; then
  mkdir -p /data
  current_uid="$(stat -c '%u' /data)"
  current_gid="$(stat -c '%g' /data)"
  if [ "$current_uid" != "$PUID" ] || [ "$current_gid" != "$PGID" ]; then
    echo "[entrypoint] Setting ownership of /data to ${PUID}:${PGID}"
    if ! chown -R "${PUID}:${PGID}" /data; then
      echo "[entrypoint] Warning: could not change the ownership of /data." >&2
      echo "[entrypoint] Mount it with ownership ${PUID}:${PGID} or set PUID/PGID to its owner." >&2
    fi
  fi

  # Drop root but keep the extra groups Docker added (video, render, ...),
  # which are needed for hardware acceleration. Group 0 is not kept.
  extra_groups="$(id -G | tr ' ' '\n' | awk '$1 != 0' | paste -sd, -)"
  export HOME=/home/node
  if [ -n "$extra_groups" ]; then
    exec setpriv --reuid "$PUID" --regid "$PGID" --groups "$extra_groups" -- "$@"
  fi
  exec setpriv --reuid "$PUID" --regid "$PGID" --clear-groups -- "$@"
fi

exec "$@"
