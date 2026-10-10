#!/usr/bin/env bash
# Puts the WHOLE database back to one night's backup. Everything anyone did
# since that backup is lost, for every user. To bring back one account only,
# use the Backups screen in the app (Settings > Backups > One account).
#
#   bash ~/chipperly/deploy/contabo/restore.sh 2026-10-07
#
# The Backups screen starts this same script through systemd-run, because it
# stops the app and so cannot run inside it.
#
# What it does, in order:
#   1. copies the live database to pre-restore-<time>.dump in the backup folder
#   2. stops the app
#   3. replaces the database with the backup, in ONE transaction: if any
#      statement fails, nothing has changed
#   4. runs the migrations, so a backup from before an update gets today's tables
#   5. starts the app and waits for it to answer
# Progress goes to restore-status.json in the backup folder, which the screen reads.
#
# A rehearsal that touches neither the live database nor the app:
#   RESTORE_DB_URL=postgres://.../some_scratch_db RESTORE_NO_RESTART=1 bash restore.sh 2026-10-07
set -euo pipefail

day="${1:?usage: restore.sh YYYY-MM-DD}"
[[ "$day" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || { echo "not a backup date: $day" >&2; exit 2; }

api="$HOME/chipperly/apps/api"
dir="${BACKUP_DIR:-$HOME/backups/chipperly}"
dump="$dir/db-$day.dump"
status="${RESTORE_STATUS_FILE:-$dir/restore-status.json}"

# .env is not shell syntax (MAIL_FROM has spaces and angle brackets), so read the value by name.
env_value() { grep -m1 "^$1=" "$api/.env" | cut -d= -f2- | sed -e 's/^["'\'']//' -e 's/["'\'']$//'; }
db_url="${RESTORE_DB_URL:-$(env_value DATABASE_URL)}"
restart=1
[ -n "${RESTORE_NO_RESTART:-}" ] && restart=0

now_ms() { date +%s%3N; }
started="$(now_ms)"
# state, finished_at ("null" or ms), message (plain words, no quotes)
write_status() {
  local message="null"
  [ -n "${3:-}" ] && message="\"$(printf '%s' "$3" | tr -d '"\\' | tr '\n' ' ')\""
  printf '{"state":"%s","date":"%s","started_at":%s,"finished_at":%s,"message":%s}\n' "$1" "$day" "$started" "$2" "$message" > "$status.tmp"
  mv "$status.tmp" "$status"
}

stopped=0
fail() {
  write_status failed "$(now_ms)" "$1"
  # The restore is one transaction, so a failure leaves the database as it was: the app can come back.
  [ "$stopped" = 1 ] && sudo systemctl start chipperly || true
  echo "restore failed: $1" >&2
  exit 1
}
trap 'fail "stopped at line $LINENO"' ERR

[ -f "$dump" ] || fail "there is no backup for $day"
pg_restore --list "$dump" > /dev/null || fail "the backup file for $day cannot be read"
write_status running null ""

safety="$dir/pre-restore-$(date +%FT%H%M%S).dump"
pg_dump --format=custom --file="$safety" "$db_url"

if [ "$restart" = 1 ]; then
  sudo systemctl stop chipperly
  stopped=1
fi

# --clean alone would leave tables that were added after the backup, and the
# migrations would then fail to create them. So both schemas go first, inside
# the same transaction as the restore.
{
  echo 'DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;'
  pg_restore --no-owner --no-privileges --file=- "$dump"
} | psql --quiet --single-transaction --set ON_ERROR_STOP=1 --dbname="$db_url" > /dev/null

# A value already in the environment wins over --env-file, so a rehearsal migrates its own database.
(cd "$api" && DATABASE_URL="$db_url" DATABASE_URL_OWNER="$db_url" node --env-file=.env --import tsx src/db/migrate.ts > /dev/null)

if [ "$restart" = 1 ]; then
  sudo systemctl start chipperly
  stopped=0
  for _ in $(seq 1 30); do sleep 1; curl -sf -o /dev/null http://127.0.0.1:8064/api/health && break; done
  curl -sf -o /dev/null http://127.0.0.1:8064/api/health || fail "the database was restored but the app did not come back up"
fi

write_status done "$(now_ms)" "The copy from just before is $(basename "$safety")"
echo "$(date -Is) restored $day (copy from before: $(basename "$safety"))"
