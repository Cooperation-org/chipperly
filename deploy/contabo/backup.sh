#!/usr/bin/env bash
# Nightly backup on the Contabo VPS: a pg_dump of the database and a tar of
# the uploads, kept for 14 days in ~/backups/chipperly. Runs from cron
# (README.md, "Backups"). Run it by hand before a risky deploy too.
#
# These copies sit on the same disk as the data. They cover a bad deploy or
# a mistaken delete, not the loss of the server.
set -euo pipefail

api="$HOME/chipperly/apps/api"
dir="$HOME/backups/chipperly"
stamp="$(date +%F)"
keep_days=14

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

find "$dir" -type f \( -name 'db-*.dump' -o -name 'uploads-*.tar.gz' \) -mtime +"$keep_days" -delete

echo "$(date -Is) ok db=$(du -h "$dir/db-$stamp.dump" | cut -f1) uploads=$(du -h "$dir/uploads-$stamp.tar.gz" | cut -f1) kept=$(find "$dir" -name 'db-*.dump' | wc -l)"
