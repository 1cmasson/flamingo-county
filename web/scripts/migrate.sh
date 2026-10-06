#!/bin/sh
# `payload migrate`, checked. Used by the image build (Dockerfile) and at boot
# (docker-entrypoint.sh).
#
# A non-zero exit from `payload migrate` is a real failure and stops at once.
# An exit 0 is only believed once scripts/check-migrated.mjs finds every
# migration recorded in the database: the CLI has exited 0 having done nothing
# (2026-10-02), and that is the case retried here, up to 3 runs in all. When
# the check cannot tell at all (exit 2), this goes on as if it weren't there.
set -u
cd "$(dirname "$0")/.."

attempt=1
while [ "$attempt" -le 3 ]; do
  pnpm payload migrate || exit 1
  node --no-warnings scripts/check-migrated.mjs
  case $? in
    0) exit 0 ;;
    1) echo "migrate: payload migrate exited 0 but left migrations unapplied (run $attempt of 3)" >&2 ;;
    *)
      # The check itself could not tell; trust payload migrate, as before it existed.
      echo "migrate: could not verify the migrations; continuing on payload migrate's exit 0" >&2
      exit 0
      ;;
  esac
  attempt=$((attempt + 1))
done
echo "migrate: giving up after 3 runs" >&2
exit 1
