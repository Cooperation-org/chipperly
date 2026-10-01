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
`~/backups/chipperly`, keeping 14 days. It runs from mhany's crontab at 03:17:

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

These backups are on the same disk as the data. They cover a bad deploy or a
mistaken delete, not the loss of the server. A copy somewhere else (an R2
bucket, or Contabo's own snapshots) is not set up yet.

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
