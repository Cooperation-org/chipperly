#!/usr/bin/env bash
# Production deploy, per docs/technical-plan.md section 10.
# NOT RUN YET. Recorded for when infrastructure and the go-ahead exist.
set -euo pipefail

cd /opt/chipperly

git tag "deploy-$(date +%Y%m%d-%H%M%S)"
git pull

pnpm install --frozen-lockfile

pnpm -F @chipperly/shared build
pnpm -F @chipperly/web build
pnpm -F @chipperly/api build

# Migrations run with the owner role.
DATABASE_URL="$DATABASE_URL_OWNER" pnpm -F @chipperly/api db:migrate

sudo systemctl restart chipperly
