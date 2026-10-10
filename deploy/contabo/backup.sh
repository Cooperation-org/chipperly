#!/usr/bin/env bash
# Nightly backup on the Contabo VPS: a pg_dump of the database and a tar of
# the uploads, kept for 30 days in ~/backups/chipperly. Runs from cron
# (README.md, "Backups"). Run it by hand before a risky deploy too.
#
# The local copies sit on the same disk as the data: they cover a bad deploy
# or a mistaken delete. The copy sent to R2 at the end covers losing the server.
set -euo pipefail

api="$HOME/chipperly/apps/api"
dir="$HOME/backups/chipperly"
stamp="$(date +%F)"
# 30 days here as well as off-site: the app's Backups screen restores from these files.
keep_days=30

# .env is not shell syntax (MAIL_FROM has spaces and angle brackets), so read the two values by name.
env_value() { grep -m1 "^$1=" "$api/.env" | cut -d= -f2- | sed -e 's/^["'\'']//' -e 's/["'\'']$//'; }
db_url="$(env_value DATABASE_URL)"
uploads="$(cd "$api" && realpath "$(env_value UPLOAD_DIR)")"

mkdir -p "$dir"
chmod 700 "$dir"

# Written under a temporary name and listed back before it counts: a truncated dump must not replace a good one.
pg_dump --format=custom --file="$dir/db-$stamp.dump.tmp" "$db_url"
pg_restore --list "$dir/db-$stamp.dump.tmp" > /dev/null
mv "$dir/db-$stamp.dump.tmp" "$dir/db-$stamp.dump"

tar -czf "$dir/uploads-$stamp.tar.gz.tmp" -C "$(dirname "$uploads")" "$(basename "$uploads")"
mv "$dir/uploads-$stamp.tar.gz.tmp" "$dir/uploads-$stamp.tar.gz"

find "$dir" -type f \( -name 'db-*.dump' -o -name 'uploads-*.tar.gz' -o -name 'pre-restore-*.dump' \) -mtime +"$keep_days" -delete

# The copy that survives losing this server: an add-only drop box in front of
# an R2 bucket (backup-worker/). ~/.chipperly-backup.env holds BACKUP_URL and
# BACKUP_SECRET; without that file this step is skipped. A failed upload ends
# the script here, so the log line below is only written when it worked.
offsite=none
if [ -f "$HOME/.chipperly-backup.env" ]; then
  # shellcheck disable=SC1091
  . "$HOME/.chipperly-backup.env"
  at="$(date +%FT%H%M)"
  # The header goes in on stdin so the secret never shows in the process list.
  put() { printf 'Authorization: Bearer %s' "$BACKUP_SECRET" | curl -fsS --retry 3 --max-time 600 -X PUT -H @- -T "$1" "$BACKUP_URL/$2" > /dev/null; }
  put "$dir/db-$stamp.dump" "db-$at.dump"
  put "$dir/uploads-$stamp.tar.gz" "uploads-$at.tar.gz"
  offsite="r2:$at"
fi

echo "$(date -Is) ok db=$(du -h "$dir/db-$stamp.dump" | cut -f1) uploads=$(du -h "$dir/uploads-$stamp.tar.gz" | cut -f1) kept=$(find "$dir" -name 'db-*.dump' | wc -l) offsite=$offsite"
