# Contabo VPS

Chipperly's own server since 29 Sept 2026 (moved off the shared dev VM 200).
Contabo Cloud VPS 4, Ubuntu 24.04, `89.117.20.203`, `app.chipperlyapp.com`
(Cloudflare DNS, A record, not proxied). SSH as `mhany` with a key; root and
password logins are off. ufw allows 22, 80 and 443.

Runs: Node 22, PostgreSQL 18 (system package), Caddy (TLS), ffmpeg.
The API serves the web export at `/` and the API at `/api/`, on 127.0.0.1:8064.

## Update

    bash ~/chipperly/deploy/contabo/deploy.sh

## Backups

`backup.sh` dumps the database (`pg_dump`, custom format, listed back with
`pg_restore --list` before it counts) and tars the uploads into
`~/backups/chipperly`, keeping 30 days. It runs from mhany's crontab at 03:17:

    install -m 700 ~/chipperly/deploy/contabo/backup.sh ~/bin/chipperly-backup.sh
    (crontab -l 2>/dev/null; echo '17 3 * * * $HOME/bin/chipperly-backup.sh >> $HOME/backups/chipperly/backup.log 2>&1') | crontab -

The cron line runs the copy in `~/bin`, so a deploy never changes what runs
at night; repeat the `install` line after editing the script. Check it with
`tail ~/backups/chipperly/backup.log`.

Restore into a scratch database first, then swap if it is what you want:

    sudo -u postgres createdb -O chipperly chipperly_restore
    # piped in: the postgres user cannot read the 700 backup folder
    sudo -u postgres pg_restore --no-owner --role=chipperly -d chipperly_restore < ~/backups/chipperly/db-YYYY-MM-DD.dump
    tar -xzf ~/backups/chipperly/uploads-YYYY-MM-DD.tar.gz -C /tmp

Tested on 1 Oct 2026: the restored copy had the same row counts as live.

### The copy off the server

The files in `~/backups/chipperly` are on the same disk as the data. After
writing them, `backup.sh` sends both to the R2 bucket `chipperly-app-backups`
(Chipperly's Cloudflare account, western North America), where they are deleted
after 30 days by the bucket's lifecycle rule. Each upload is named with the date
and time, for example `db-2026-10-02T0317.dump`.

The server does not hold a Cloudflare token. It sends the files to a small
Worker, `backup-worker/` (`https://chipperly-backup.chipperly.workers.dev`),
with a secret that can add a file and nothing else: no listing, reading,
replacing or deleting. `~/.chipperly-backup.env` (chmod 600) on the server holds
`BACKUP_URL` and `BACKUP_SECRET`; without that file the upload is skipped. The
log line ends with `offsite=r2:<time>` when the upload worked.

To get a copy back, use a Cloudflare token that can read R2 (the site deploy
token can), from `apps/site`:

    pnpm exec wrangler r2 object get chipperly-app-backups/db-YYYY-MM-DDTHHMM.dump --remote --file db.dump

To deploy the Worker again or change the secret (then put the same value in
`~/.chipperly-backup.env` on the server):

    pnpm exec wrangler deploy --config ../../deploy/contabo/backup-worker/wrangler.jsonc
    openssl rand -hex 32 | pnpm exec wrangler secret put BACKUP_SECRET --config ../../deploy/contabo/backup-worker/wrangler.jsonc

Tested on 2 Oct 2026: the two files in R2 had the same SHA-256 as the files on
the server, and the secret was refused for reading, replacing and deleting.

## Restoring

Super admins have a Backups screen in the app (Settings > Backups). It lists the
days in `~/backups/chipperly`, and for a chosen day it can:

- **Restore one account.** Search for the account as it was that day, see how
  many rows are missing, changed, the same or newer, and which named things
  (people, routines, rewards, stories) would come back. A restore writes the
  missing and changed rows, leaves newer rows alone and deletes nothing.
- **Restore the whole database.** Shows the row counts per table first, then
  wants the words `RESTORE <date>`. It runs `restore.sh` below.

Both take a copy of the live database first (`pre-restore-<time>.dump`, kept 30
days like the rest). The screen needs two lines in `apps/api/.env`, then a
restart:

    BACKUP_DIR=/home/mhany/backups/chipperly
    BACKUP_RESTORE_SCRIPT=/home/mhany/chipperly/deploy/contabo/restore.sh

Without `BACKUP_DIR` the screen says the server keeps no backups. Without
`BACKUP_RESTORE_SCRIPT` one account can be restored and the whole database cannot.

By hand, the whole database:

    bash ~/chipperly/deploy/contabo/restore.sh 2026-10-07

It stops the app, replaces the database in one transaction (a failure leaves it
as it was), runs the migrations and starts the app again. To rehearse on a
scratch database without touching the live one or the app:

    sudo -u postgres createdb -O chipperly chipperly_rehearsal
    RESTORE_DB_URL=postgres://chipperly:<pw>@127.0.0.1/chipperly_rehearsal RESTORE_NO_RESTART=1       RESTORE_STATUS_FILE=/tmp/rehearsal-status.json bash ~/chipperly/deploy/contabo/restore.sh 2026-10-07
    sudo -u postgres dropdb chipperly_rehearsal

The uploads (photos, recordings) are not restored by either path. They are in
`uploads-YYYY-MM-DD.tar.gz` and are put back by hand.

## First-time setup

    # database: one local role that owns it (the migrations add no grants,
    # so a separate app role would need them; not worth it on a one-app box)
    sudo -u postgres psql -c "create role chipperly login password '<pw>'"
    sudo -u postgres psql -c "create database chipperly owner chipperly"

    git clone https://github.com/Cooperation-org/chipperly.git ~/chipperly
    # apps/api/.env (chmod 600): DATABASE_URL, DATABASE_URL_OWNER, PORT=8064,
    # HOST=127.0.0.1, BASE_PATH=, WEB_DIR=../web/out, UPLOAD_DIR=/home/mhany/chipperly-uploads,
    # APP_ORIGIN=https://app.chipperlyapp.com, JWT_SECRET, RESEND_API_KEY, MAIL_FROM, ...
    # Optional: OPENVERSE_CLIENT_ID and OPENVERSE_CLIENT_SECRET turn on in-app image search
    # (both set, then `sudo systemctl restart chipperly`). Unset, the feature stays hidden.

    sudo cp deploy/contabo/chipperly.service /etc/systemd/system/
    sudo systemctl daemon-reload && sudo systemctl enable chipperly
    sudo cp deploy/contabo/Caddyfile /etc/caddy/Caddyfile && sudo systemctl reload caddy
    bash deploy/contabo/deploy.sh
