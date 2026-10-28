#!/usr/bin/env bash
# Chipperly on the Contabo VPS (app.chipperlyapp.com). Run as mhany:
#   bash ~/chipperly/deploy/contabo/deploy.sh
# Pulls the checked-out branch (main here, dev in ~/chipperly-dev), builds the web export (served at the root) and the API,
# runs migrations, restarts the systemd unit. First-time setup (Postgres
# roles, apps/api/.env, the unit and the Caddyfile) is in README.md.
# deploy-dev.sh runs this same script for the dev copy by setting the CHIPPERLY_ values.
set -euo pipefail
DIR="${CHIPPERLY_DIR:-$HOME/chipperly}"
SERVICE="${CHIPPERLY_SERVICE:-chipperly}"
PORT="${CHIPPERLY_PORT:-8064}"
ORIGIN="${CHIPPERLY_ORIGIN:-https://app.chipperlyapp.com}"
ADMIN="${CHIPPERLY_ADMIN_ORIGIN:-https://admin.chipperlyapp.com}"
cd "$DIR"
git pull -q --ff-only
echo "commit: $(git rev-parse --short HEAD)"

echo "== install"; pnpm install --frozen-lockfile 2>&1 | tail -1
echo "== build shared"; pnpm -F @chipperly/shared build 2>&1 | tail -1

cat > apps/web/.env.production <<EOF
NEXT_PUBLIC_BASE_PATH=
NEXT_PUBLIC_API_ORIGIN=
NEXT_PUBLIC_SITE_ORIGIN=$ORIGIN
NEXT_PUBLIC_ADMIN_URL=$ADMIN
EOF
export GIT_SHA="$(git rev-parse HEAD)"
echo "== build web"; (cd apps/web && pnpm build 2>&1 | tail -2)
echo "== build api"; pnpm -F @chipperly/api build 2>&1 | tail -1

echo "== migrate"; (cd apps/api && node --env-file=.env --import tsx src/db/migrate.ts 2>&1 | tail -1)

sudo systemctl restart "$SERVICE"
for i in $(seq 1 30); do sleep 1; curl -sf -o /dev/null http://127.0.0.1:$PORT/api/health && break; done
echo "health: $(curl -s http://127.0.0.1:$PORT/api/health)"
echo "root:   $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:$PORT/)"
