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

## Sync health

Super admins have a Sync health screen (Settings > Sync health). It lists every
change a device made that is not on the server: writes the server refused (each
kept with its row, with a Put back button), devices that report unsent writes,
and saved rows whose parent never arrived.

The server mails `SYNC_ALERT_EMAIL_TO` in `apps/api/.env` (unset: everyone in
`SUPER_ADMIN_EMAILS`) when a write is refused for good, and once a day after
13:00 UTC for as long as anything is open. To see the same from the shell:

    journalctl -u chipperly | grep -E 'sync push refused|device reported unsent'
    psql "$DATABASE_URL" -c "select created_at, table_name, reason, resolution from sync_rejections order by created_at desc limit 20"

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

## Admin site (admin.chipperlyapp.com)

The same build and API, on its own address. Sign-in there goes to `/admin/`; the app's
Settings shows one "Admin site" row that links here. Super admins (`SUPER_ADMIN_EMAILS`) can
change things; people with `users.is_support` (switched on from a person's sheet) can only look.

One-time setup:

1. Cloudflare DNS: `admin` A record to this server's IP, DNS only (not proxied), like `app`.
2. `sudo cp deploy/contabo/Caddyfile /etc/caddy/Caddyfile && sudo systemctl reload caddy`
   (Caddy gets the certificate on the first request).
3. `apps/api/.env`: `ADMIN_ORIGIN=https://admin.chipperlyapp.com` (links in emails to super admins).
4. Stripe webhook: also subscribe to `invoice.paid`, so organization invoices are marked paid.

### Admin site, round 2 (two-step sign-in, waitlist, email log, errors)

- Two-step sign-in is on by default (`ADMIN_TWO_STEP`, set `off` only on a local or test server). Each admin
  sets it up at their first visit; a super admin can reset someone's from their person sheet.
- Waitlist: the admin site reads the website's waitlist with `ADMIN_LINK_SECRET` (at least 32 characters), the
  same value in `apps/api/.env` and on the website (`wrangler secret put ADMIN_LINK_SECRET` in apps/site). Do not
  use `CRON_SECRET` for this: setting `CRON_SECRET` on the API hands reminders and sync-health checks to an outside
  cron, which nothing runs today. The website's migration `20261013_100000_waitlist_invited` runs on the next
  "Deploy site".
- `SITE_ORIGIN` defaults to https://chipperlyapp.com.

## Dev copy (dev-app.chipperlyapp.com)

Branch `dev`, on the same server, apart from live in every way that matters: its own clone
(`~/chipperly-dev`), unit (`chipperly-dev`, 127.0.0.1:8065, 1 GB cap), database (`chipperly_dev`,
role `chipperly_dev`), uploads (`~/chipperly-dev-uploads`) and `.env`. It starts with no live
data, so reminders and emails only ever reach the test accounts made there. Stripe uses sandbox
keys. No backups, no Google or Apple sign-in, no Firebase push, no newsletter or waitlist link.
`dev-admin.chipperlyapp.com` is its admin site.

Work lands on `dev`, is checked on dev-app, then `dev` is merged into `main` for the live deploy.

    bash ~/chipperly-dev/deploy/contabo/deploy-dev.sh

Both dev addresses ask for a password (user `dev`) on every page. `/api/*` stays open, because the
app sends its own sign-in in the same Authorization header (and Stripe posts its webhook there);
the API checks every caller itself. The hash is kept out of this public repo, in `/etc/caddy/dev-auth`:

    printf 'basic_auth @locked {\n\tdev %s\n}\n' "$(caddy hash-password --plaintext '<password>')" | sudo tee /etc/caddy/dev-auth
    sudo chmod 640 /etc/caddy/dev-auth && sudo chgrp caddy /etc/caddy/dev-auth

One-time setup:

    sudo -u postgres psql -c "create role chipperly_dev login password '<pw>'"
    sudo -u postgres psql -c "create database chipperly_dev owner chipperly_dev"
    git clone -b dev https://github.com/Cooperation-org/chipperly.git ~/chipperly-dev
    # apps/api/.env (chmod 600): as live, but PORT=8065, the chipperly_dev database,
    # UPLOAD_DIR=/home/mhany/chipperly-dev-uploads, APP_ORIGIN=https://dev-app.chipperlyapp.com,
    # ADMIN_ORIGIN=https://dev-admin.chipperlyapp.com, a new JWT_SECRET, sandbox STRIPE_ values,
    # the dev Resend key, MAIL_FROM with "Chipperly DEV", new VAPID keys
    sudo cp ~/chipperly-dev/deploy/contabo/chipperly-dev.service /etc/systemd/system/
    sudo systemctl daemon-reload && sudo systemctl enable chipperly-dev
    sudo cp ~/chipperly-dev/deploy/contabo/Caddyfile /etc/caddy/Caddyfile
    caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy
    bash ~/chipperly-dev/deploy/contabo/deploy-dev.sh

Cloudflare DNS: `dev-app` and `dev-admin` A records to this server, DNS only, like `app`.
