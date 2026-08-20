# Flamingo County — Payload CMS + Next.js, for Railway.
#
# BUILD CONTEXT IS THE REPO ROOT, not `web/`. That is deliberate and it is the
# one thing to preserve if this file is ever rewritten: `pnpm seed` reads
# `../fc-data.js` (src/seed/load-fc-data.ts) and `../data-import/listings.json`,
# both of which live outside `web/`. Building with `web/` as the context makes
# the image look fine and then fail the moment anyone seeds.
#
# Requires `output: 'standalone'` in next.config.ts, which produces the
# server.js the runtime stage starts.

FROM node:22.17.0-alpine AS base
RUN apk add --no-cache libc6-compat
# Pinned via package.json's `packageManager`. It matters: newer pnpm stopped
# reading the `pnpm` field in package.json, so `onlyBuiltDependencies` was
# ignored and sharp's build script never ran — the install then failed outright.
RUN corepack enable pnpm && corepack prepare pnpm@10.30.3 --activate

# ---------------------------------------------------------------- deps
FROM base AS deps
WORKDIR /app/web
COPY web/package.json web/pnpm-lock.yaml* web/.npmrc* ./
RUN pnpm install --frozen-lockfile

# ---------------------------------------------------------------- build
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/web/node_modules ./web/node_modules
# The whole repo: web/ plus the seed's data sources at the root.
COPY . .
WORKDIR /app/web
# A build-time value is enough to satisfy config loading; the real secret and
# database URL arrive as runtime env vars.
ENV PAYLOAD_SECRET=build-only-not-a-real-secret
ENV DATABASE_URL=file:/tmp/build.db
ENV NEXT_TELEMETRY_DISABLED=1
# `generateStaticParams` runs during the build and queries Payload, so the build
# database needs a schema or the build dies on "no such table: cities". The
# tables stay empty, which is correct — every route renders dynamically, so
# nothing is prerendered from this throwaway database.
RUN pnpm payload migrate && pnpm run build

# ---------------------------------------------------------------- runtime
FROM base AS runner
WORKDIR /app/web
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/web/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/web/.next/static ./.next/static

# Kept in the image so the container can seed itself on first boot — the seed
# evaluates fc-data.js, reads the researched dossiers, and uploads the source
# photography from assets/ mascots/ uploads/ (src/seed/index.ts:168+). Without
# those three directories the seed completes with 0 media and every photo slot
# on the site renders as its empty state.
COPY --from=builder --chown=nextjs:nodejs /app/fc-data.js /app/fc-data.js
COPY --from=builder --chown=nextjs:nodejs /app/data-import /app/data-import
COPY --from=builder --chown=nextjs:nodejs /app/assets /app/assets
COPY --from=builder --chown=nextjs:nodejs /app/mascots /app/mascots
COPY --from=builder --chown=nextjs:nodejs /app/uploads /app/uploads

# Migrations run from source at boot, so the CLI and the TS files have to be
# present in the runtime image, not just the build stage.
COPY --from=builder --chown=nextjs:nodejs /app/web/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/web/src ./src
COPY --from=builder --chown=nextjs:nodejs /app/web/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/web/tsconfig.json ./tsconfig.json
COPY --from=builder --chown=nextjs:nodejs /app/web/next.config.ts ./next.config.ts

# The volume mount point. Both the database and the uploads live under here;
# anything written outside it is gone on the next deploy.
RUN mkdir -p /data/media && chown -R nextjs:nodejs /data

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Migrate before serving. A failed migration must stop the boot rather than
# start a server against a schema that does not match the code.
CMD ["sh", "-c", "pnpm payload migrate && node server.js"]
