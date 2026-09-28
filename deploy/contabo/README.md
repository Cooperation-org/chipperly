# Contabo VPS

Chipperly's own server since 29 Sept 2026 (moved off the shared dev VM 200).
Contabo Cloud VPS 4, Ubuntu 24.04, `89.117.20.203`, `app.chipperlyapp.com`
(Cloudflare DNS, A record, not proxied). SSH as `mhany` with a key; root and
password logins are off. ufw allows 22, 80 and 443.

Runs: Node 22, PostgreSQL 18 (system package), Caddy (TLS), ffmpeg.
The API serves the web export at `/` and the API at `/api/`, on 127.0.0.1:8064.

## Update

    bash ~/chipperly/deploy/contabo/deploy.sh

## First-time setup

    # database: one local role that owns it (the migrations add no grants,
    # so a separate app role would need them; not worth it on a one-app box)
    sudo -u postgres psql -c "create role chipperly login password '<pw>'"
    sudo -u postgres psql -c "create database chipperly owner chipperly"

    git clone https://github.com/Cooperation-org/chipperly.git ~/chipperly
    # apps/api/.env (chmod 600): DATABASE_URL, DATABASE_URL_OWNER, PORT=8064,
    # HOST=127.0.0.1, BASE_PATH=, WEB_DIR=../web/out, UPLOAD_DIR=/home/mhany/chipperly-uploads,
    # APP_ORIGIN=https://app.chipperlyapp.com, JWT_SECRET, RESEND_API_KEY, MAIL_FROM, ...

    sudo cp deploy/contabo/chipperly.service /etc/systemd/system/
    sudo systemctl daemon-reload && sudo systemctl enable chipperly
    sudo cp deploy/contabo/Caddyfile /etc/caddy/Caddyfile && sudo systemctl reload caddy
    bash deploy/contabo/deploy.sh
