# Chipperly: start here

One page with every link. Written 19 Sept 2026, last updated 1 Oct 2026; keep it current when something moves.

For setup, environments (live and dev), CI, deploys, rollback and the ops panel, [README.md](README.md) is the current guide (29 Oct 2026). Where the two disagree, the README is right.

## What it is

Visual supports for neurodivergent children (Today schedule, chip board, timer, first-then, social stories, Chipper Chart), used by parents, teachers and therapists and, in a locked view, by the child. Client: Chipperly LLC (Taymar Pixley, Tucson). Built by Cooperation-org as an offline-first PWA (Next.js static export) on a Fastify + Postgres API. MIT licence, public repo.

## Where things live

| What | Where |
| --- | --- |
| Code | <https://github.com/Cooperation-org/chipperly> (work goes to `dev`, live runs `main`; see the README) |
| Live app | <https://app.chipperlyapp.com> on Chipperly's own Contabo VPS since 29 Sept 2026 (`~/chipperly`, systemd unit `chipperly`, Caddy, system PostgreSQL 18, uploads on disk). Setup, update, backups and restore are in `deploy/contabo/README.md`. `/api/health` names the running commit |
| Marketing site | <https://chipperlyapp.com>, `apps/site` (Next.js + Payload on a Cloudflare Worker, D1 and R2, with the blog). Deployed by hand from the Actions tab, workflow "Deploy site" |
| Old demo | `demos.linkedtrust.us/chipperly-next/` on the shared dev VM 200 was switched off on 29 Sept 2026 and redirects to the live app. `deploy/vm200/` is kept for reference. Not the old Rails demo (`chipperly`, golda's) |
| Sign-in | sign-up is open and there is a no-account guest mode; the shared test login is in the team channel, not here |
| Owner's feedback doc | "Notes on App So Far", Google Doc (link in the team channel); turned into [ROADMAP.md](ROADMAP.md) |
| Owner's brand files | `brand/` (logo SVGs, lockups, favicon package); the brand kit PDF is in her Drive share |
| Old Rails app | <https://github.com/samplep182/chipperly> (`db/schema.rb` copied to `docs/reference/rails-schema.rb`; notes in `docs/reference/rails-app-analysis.md`); the importer is `docs/import-rails.md` |
| Docs | `docs/CONTRACTS.md` (names, shapes, env vars, sync rules: read before changing code), `docs/technical-plan.md` (why the system is shaped this way, production layout), `docs/ux-plan.md` (every screen), `docs/brand.md` (colours, fonts) |
| CI | GitHub Actions, `.github/workflows/ci.yml`: typecheck, lint, unit tests, build, then Playwright at phone / tablet / desktop / iPad (WebKit) |

## Run it locally

```bash
pnpm install
cp apps/api/.env.example apps/api/.env      # set JWT_SECRET (32+ chars)
pnpm -F @chipperly/api db:start             # embedded Postgres on 54329, first run downloads it
pnpm -F @chipperly/api db:migrate
pnpm -F @chipperly/api dev                  # http://127.0.0.1:8080/api
pnpm -F @chipperly/web dev                  # http://localhost:3000
```

Checks: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`, then `pnpm e2e` (needs the build; `pnpm e2e --project=phone e2e/specs/today.spec.ts` for one spec). `e2e/README.md` has the details.

## Deploy

See README.md, "Deploying to live": the "Deploy app" and "Deploy site" workflows (with an approval), or `bash /usr/local/lib/chipperly/deploy.sh` on the server, and rollback from the ops panel. A database and uploads backup runs every night at 03:17 server time and can be run by hand before a risky deploy (`~/bin/chipperly-backup.sh`).

## Things to know about the live app

- Real families use it. The database is not a throwaway.
- Email is on (Resend). Invites also show the accept link to copy and send by hand.
- Google and Apple sign-in are built but hidden until their client ids are set.
- Live Stripe payments are on since 10 Oct 2026. Community selling stays hidden until a platform fee is set (`COMMUNITY_PLATFORM_FEE_PERCENT`).
- In-app image search (Openverse) and push notifications (Firebase) are configured.
- Backups run nightly on the server and a copy goes to the R2 bucket `chipperly-app-backups`, kept 30 days (`deploy/contabo/README.md`, "Backups").
- Errors: server errors and uncaught browser errors from signed-in sessions both land in the server log. `journalctl -u chipperly | grep client_error` shows the browser ones. Guests and signed-out visitors send nothing.

## People

- Build and this doc: Muhammad Hany (`mhany` on the VM).
- Shared dev VM and org infra: golda. The Contabo server is ours.
- Client: Taymar Pixley, Chipperly LLC.
