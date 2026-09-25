#!/usr/bin/env bash
# Builds (and optionally previews or deploys) the Cloudflare Worker on Linux.
# OpenNext does not support Windows builds, so on Windows run it in Docker:
#   docker run --rm -it -p 3100:3100 -v "<repo>:/src:ro" node:22-bookworm \
#     bash /src/apps/site/scripts/cf-linux.sh preview
# Modes: build (default), preview (local workerd on :3100, local D1/R2),
#        deploy (live; needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID).
set -euo pipefail
MODE="${1:-build}"
SRC="${SRC:-/src}"
WORK=/work
mkdir -p "$WORK"
# Copy the repo without Windows-built artefacts.
tar -C "$SRC" --exclude=node_modules --exclude=.next --exclude=.open-next --exclude=out \
  --exclude=apps/web/android --exclude=apps/web/ios --exclude=e2e/screenshots -cf - . | tar -C "$WORK" -xf -
cd "$WORK"
corepack enable >/dev/null 2>&1
CI=1 pnpm install --frozen-lockfile --filter @chipperly/site... >/dev/null
cd apps/site
case "$MODE" in
  build)   pnpm exec opennextjs-cloudflare build ;;
  preview) pnpm exec opennextjs-cloudflare build && pnpm exec opennextjs-cloudflare preview --port 3100 --ip 0.0.0.0 ;;
  deploy)  pnpm run deploy ;;
  *) echo "unknown mode $MODE"; exit 1 ;;
esac
