#!/usr/bin/env bash
# Puts live (app. and admin.chipperlyapp.com) back on one of its last 10 deploys. Run as mhany:
#   bash /usr/local/lib/chipperly/rollback.sh <commit>
# The ops panel runs it (/etc/sudoers.d/ops). It refuses a commit that is not among the last 10
# live deploys, or whose database migrations differ from what runs now: the database is never
# rolled back, so old code only runs against the schema it was written for. Backs up first.
set -euo pipefail
SHA="${1:-}"
LOG=/var/lib/chipperly-deploys/chipperly.log
DIR="$HOME/chipperly"
[[ "$SHA" =~ ^[0-9a-f]{7,40}$ ]] || { echo "usage: rollback.sh <commit>"; exit 2; }
CURRENT=$(git -C "$DIR" rev-parse --short HEAD)
# The last 10 distinct deployed commits other than the current one.
TARGETS=$(tac "$LOG" | awk '{print $2}' | awk '!seen[$0]++' | grep -v "^$CURRENT" | head -10)
grep -q "^${SHA:0:7}" <<<"$TARGETS" || { echo "$SHA is not one of the last 10 live deploys"; exit 3; }
git -C "$DIR" fetch -q origin
count() { git -C "$DIR" ls-tree --name-only "$1" apps/api/src/db/migrations/ | grep -c '\.sql$'; }
[ "$(count "$SHA")" = "$(count HEAD)" ] || { echo "$SHA has different database migrations from live; restore a backup instead"; exit 4; }
echo "== backup"; "$HOME/bin/chipperly-backup.sh"
echo "== rollback to $SHA"
CHIPPERLY_REF="$SHA" exec bash /usr/local/lib/chipperly/deploy.sh
