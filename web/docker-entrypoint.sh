#!/bin/sh
set -e

# The volume is mounted at /data AFTER the image is built, which shadows
# whatever the Dockerfile created there — including its ownership. On Railway
# the mount arrives owned by root, so the unprivileged `nextjs` user cannot open
# the database and Payload dies with SQLITE_CANTOPEN (error 14).
#
# A local `docker run -v name:/data` does NOT reproduce this: Docker seeds a
# fresh named volume from the image directory and carries its ownership over.
# The bug only appears on a real mount.
#
# So: start as root, take ownership of the mount, then drop to `nextjs` for the
# actual server. The app never runs privileged.
DATA_DIR="${DATA_DIR:-/data}"
mkdir -p "$DATA_DIR/media"
chown -R nextjs:nodejs "$DATA_DIR"

# Migrate before serving. A failed migration must stop the boot rather than
# leave a server running against a schema that does not match the code. Two
# databases: Payload's content.db, then Better Auth's auth.db (MEMBERS.md).
#
# auth:migrate writes a marker only after its migration has succeeded. It has
# intermittently segfaulted (exit 139) *after* that point, in native libsql
# teardown — so a non-zero exit with the marker present means "done, then
# crashed on the way out" and the boot continues. Without the marker, any
# failure still stops the boot. See src/lib/auth-migrate.ts.
exec su-exec nextjs:nodejs sh -c '
  pnpm payload migrate || exit 1
  rm -f /tmp/auth-migrate.ok
  if ! AUTH_MIGRATE_OK_FILE=/tmp/auth-migrate.ok pnpm auth:migrate; then
    [ -f /tmp/auth-migrate.ok ] || exit 1
    echo "auth:migrate exited non-zero after completing; continuing"
  fi
  exec node server.js
'
