# Chipperly demo on VM 200

Slug `chipperly`, served at `https://demos.linkedtrust.us/chipperly/`. Everything user-level is done by `deploy/vm200/deploy.sh` (clone, install, build with `NEXT_PUBLIC_BASE_PATH=/chipperly`, `.env`, embedded Postgres on 127.0.0.1:54329, API on 127.0.0.1:8064 serving the export). Two steps need root, listed below; until they are done the app answers only on the VM itself.

## Root steps (once)

```bash
sudo cp /home/mhany/chipperly/deploy/vm200/chipperly.conf /etc/nginx/app-proxies/chipperly.conf
sudo nginx -t && sudo systemctl reload nginx

sudo cp /home/mhany/chipperly/deploy/vm200/tmp-chipperly-db.service /etc/systemd/system/
sudo cp /home/mhany/chipperly/deploy/vm200/tmp-chipperly.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now tmp-chipperly-db tmp-chipperly
```

The units replace the `nohup` processes `deploy.sh` starts; stop those first with `pkill -f 'apps/api/dist/server.js'; pkill -f dev-db.mjs` (or just let the units restart them; both bind fixed ports, so only one can run).

## Update the demo

```bash
/home/mhany/chipperly/deploy/vm200/deploy.sh      # pulls main, rebuilds, migrates, restarts
sudo systemctl restart tmp-chipperly              # only if the systemd unit is installed
```

## Database

Throwaway embedded Postgres in `apps/api/.pgdata` (the dev VM guide allows local Postgres for demos). To move to VM 100, ask an admin to run `create-app-db.sh chipperly` on the Proxmox host, put the two URLs in `apps/api/.env`, run `pnpm -F @chipperly/api db:migrate`, and drop `tmp-chipperly-db`.

## Sign-up

The demo runs with `BETA_INVITE_CODE=chipper-demo` so strangers cannot create accounts on a public URL. Change or clear it in `apps/api/.env` and restart.

## Remove

```bash
sudo systemctl disable --now tmp-chipperly tmp-chipperly-db
sudo rm /etc/systemd/system/tmp-chipperly.service /etc/systemd/system/tmp-chipperly-db.service
sudo rm /etc/nginx/app-proxies/chipperly.conf
sudo systemctl daemon-reload && sudo systemctl reload nginx
rm -rf /home/mhany/chipperly /home/mhany/chipperly-uploads /home/mhany/chipperly-logs
```

Then remove the row from `cobox/app-registry.md`.
