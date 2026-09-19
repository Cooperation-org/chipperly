# Chipperly (new app) demo on VM 200

Slug `chipperly-next`, served at `https://demos.linkedtrust.us/chipperly-next/`. The slug is not `chipperly` because golda already runs a demo of the OLD Rails app on this VM under that name (`tmp-chipperly.service`, port 3044, `chipperly.digisage.tech`); nothing here touches it.

Everything user-level is done by `deploy/vm200/deploy.sh` (clone, install, build with `NEXT_PUBLIC_BASE_PATH=/chipperly-next`, `.env`, embedded Postgres on 127.0.0.1:54329, API on 127.0.0.1:8064 serving the export). Two steps need root, listed below; until they are done the app answers only on the VM itself.

## Root steps (once)

They only add three new files (`chipperly-next.conf`, `tmp-chipperly-next.service`, `tmp-chipperly-next-db.service`); nothing existing is modified or removed. `nginx -t` runs before the reload, so a bad block cannot take nginx down.

```bash
# 1. nginx route
sudo cp /home/mhany/chipperly/deploy/vm200/chipperly-next.conf /etc/nginx/app-proxies/chipperly-next.conf
sudo nginx -t && sudo systemctl reload nginx

# 2. stop the nohup'd processes deploy.sh started (they hold the same ports), then install the units
pkill -u mhany -f 'dist/server.js'; pkill -u mhany -f 'dev-db.mjs'
sudo cp /home/mhany/chipperly/deploy/vm200/tmp-chipperly-next.service /home/mhany/chipperly/deploy/vm200/tmp-chipperly-next-db.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now tmp-chipperly-next-db tmp-chipperly-next
curl -s http://127.0.0.1:8064/chipperly-next/api/health
```

## Update the demo

```bash
/home/mhany/chipperly/deploy/vm200/deploy.sh      # pulls main, rebuilds, migrates, restarts the nohup API
sudo systemctl restart tmp-chipperly-next          # only if the systemd unit is installed
```

## Database

Throwaway embedded Postgres in `apps/api/.pgdata` (the dev VM guide allows local Postgres for demos). To move to VM 100, ask an admin to run `create-app-db.sh chipperly-next` on the Proxmox host, put the two URLs in `apps/api/.env`, run `pnpm -F @chipperly/api db:migrate`, and drop `tmp-chipperly-next-db`.

## Sign-up

The demo runs with `BETA_INVITE_CODE=chipper-demo` so strangers cannot create accounts on a public URL. Change or clear it in `apps/api/.env` and restart.

## Remove

```bash
sudo systemctl disable --now tmp-chipperly-next tmp-chipperly-next-db
sudo rm /etc/systemd/system/tmp-chipperly-next.service /etc/systemd/system/tmp-chipperly-next-db.service
sudo rm /etc/nginx/app-proxies/chipperly-next.conf
sudo systemctl daemon-reload && sudo systemctl reload nginx
rm -rf /home/mhany/chipperly /home/mhany/chipperly-uploads /home/mhany/chipperly-logs
```

Then remove the `chipperly-next` row from `cobox/app-registry.md`. Leave golda's `chipperly` row alone.
