#!/usr/bin/env bash
# Chipperly demo deploy on VM 200 (user-level parts). Run as mhany.
set -euo pipefail
export NVM_DIR="$HOME/.nvm"; source "$NVM_DIR/nvm.sh" >/dev/null 2>&1 || true
cd "$HOME"
if [ ! -d chipperly/.git ]; then
  git clone -q https://github.com/Cooperation-org/chipperly.git chipperly
fi
cd chipperly
git pull -q --ff-only
echo "commit: $(git rev-parse --short HEAD)"

# pnpm via corepack, user level
corepack enable --install-directory "$HOME/.local/bin" >/dev/null 2>&1 || true
export PATH="$HOME/.local/bin:$PATH"
corepack prepare pnpm@11.1.3 --activate >/dev/null 2>&1 || true
pnpm -v

echo "== install"; pnpm install --frozen-lockfile 2>&1 | tail -3
echo "== build shared"; pnpm -F @chipperly/shared build 2>&1 | tail -1

# web export with the demo base path
cat > apps/web/.env.production <<EOF
NEXT_PUBLIC_BASE_PATH=/chipperly
NEXT_PUBLIC_API_ORIGIN=
NEXT_PUBLIC_SITE_ORIGIN=https://demos.linkedtrust.us
EOF
export GIT_SHA="$(git rev-parse HEAD)"
echo "== build web"; (cd apps/web && pnpm build 2>&1 | tail -3)
echo "== build api"; pnpm -F @chipperly/api build 2>&1 | tail -1

# api env (secrets stay on the VM only)
mkdir -p "$HOME/chipperly-uploads"
if [ ! -f apps/api/.env ]; then
  JWT="$(openssl rand -base64 48 | tr -d '\n')"
  cat > apps/api/.env <<EOF
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54329/chipperly
DATABASE_URL_OWNER=postgres://postgres:postgres@127.0.0.1:54329/chipperly
PORT=8064
HOST=127.0.0.1
JWT_SECRET=$JWT
WEB_DIR=../web/out
BASE_PATH=/chipperly
UPLOAD_DIR=$HOME/chipperly-uploads
APP_ORIGIN=https://demos.linkedtrust.us
BETA_INVITE_CODE=chipper-demo
LOG_LEVEL=info
EOF
  chmod 600 apps/api/.env
fi

# embedded postgres (throwaway demo db, kept in the project dir per the dev VM guide)
mkdir -p "$HOME/chipperly-logs"
if ! ss -tln | grep -q ':54329 '; then
  (cd apps/api && setsid nohup node scripts/dev-db.mjs > "$HOME/chipperly-logs/db.log" 2>&1 &)
  for i in $(seq 1 60); do sleep 1; ss -tln | grep -q ':54329 ' && break; done
fi
ss -tln | grep -q ':54329 ' && echo "db: up" || { echo "db: FAILED"; tail -20 "$HOME/chipperly-logs/db.log"; exit 1; }
sleep 2
echo "== migrate"; (cd apps/api && node --env-file=.env --import tsx src/db/migrate.ts 2>&1 | tail -1)

# api (serves the export too)
pkill -f 'apps/api/dist/server.js' 2>/dev/null || true
sleep 1
(cd apps/api && setsid nohup node --env-file=.env dist/server.js > "$HOME/chipperly-logs/api.log" 2>&1 &)
for i in $(seq 1 30); do sleep 1; curl -s -o /dev/null http://127.0.0.1:8064/chipperly/api/health && break; done
echo "health: $(curl -s http://127.0.0.1:8064/chipperly/api/health)"
echo "root:   $(curl -s -o /dev/null -w '%{http_code} %{content_type}' http://127.0.0.1:8064/chipperly/)"
echo "today:  $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8064/chipperly/today/)"
echo "sw:     $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8064/chipperly/sw.js)"
