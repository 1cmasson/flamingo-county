#!/bin/sh
# `payload migrate`, checked. Used by the image build (Dockerfile) and at boot
# (docker-entrypoint.sh).
#
# A non-zero exit from `payload migrate` is a real failure and stops at once.
# An exit 0 is only believed once scripts/check-migrated.mjs finds every
# migration recorded in the database: the CLI has exited 0 having done nothing
# (2026-10-02), and that is the case retried here, up to 3 runs in all.
set -u
cd "$(dirname "$0")/.."

attempt=1
while [ "$attempt" -le 3 ]; do
  pnpm payload migrate || exit 1
  if node --no-warnings scripts/check-migrated.mjs; then
    exit 0
  fi
  echo "migrate: payload migrate exited 0 but left migrations unapplied (run $attempt of 3)" >&2
  attempt=$((attempt + 1))
done
echo "migrate: giving up after 3 runs" >&2
exit 1
