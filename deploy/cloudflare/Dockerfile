# Chipperly API image for Cloudflare Containers. Build context is the repo
# root (wrangler.jsonc sets image_build_context), so paths below are from there.
# The web export is NOT in this image: the Worker serves it as static assets.

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable && corepack prepare pnpm@11.1.3 --activate
WORKDIR /repo

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @chipperly/api...
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm -F @chipperly/shared build && pnpm -F @chipperly/api build \
 && cp -r apps/api/src/db/migrations apps/api/dist/db/migrations

FROM base AS runtime
# ffmpeg brings ffprobe too; media/pipeline.ts spawns both.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
 && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --prod --filter @chipperly/api...
COPY --from=build /repo/packages/shared/dist packages/shared/dist
COPY --from=build /repo/apps/api/dist apps/api/dist

WORKDIR /repo/apps/api
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080
EXPOSE 8080
# ponytail: migrate on every boot. Drizzle skips applied ones, so it is a
# no-op after the first start; move to a CI step if boots get slow.
CMD ["sh", "-c", "node dist/db/migrate.js && exec node dist/server.js"]
