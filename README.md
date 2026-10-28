# Chipperly

Visual supports for neurodivergent children and adults: a Today schedule, a chip board with rewards, a timer, first-then boards, social stories and the Chipper Chart. Parents, teachers, therapists and support workers set things up; the child (the "Primary User") uses a locked, picture-first view. The client is Chipperly LLC (Taymar Pixley, Tucson). Cooperation-org builds it. MIT licence, public repo.

The app is an offline-first PWA (Next.js static export) on a Fastify and PostgreSQL API, also wrapped for Android and iOS with Capacitor. The marketing site and blog are a separate Next.js and Payload app on Cloudflare Workers.

Read this file first. It covers where everything runs, how to work on it and how to ship it. The details live in the files it links to.

## Where things are

| What | Where |
| --- | --- |
| Code | <https://github.com/Cooperation-org/chipperly>. Work goes to `dev`; `main` is what live runs. |
| Live app | <https://app.chipperlyapp.com> (`/api/health` names the running commit) |
| Live admin site | <https://admin.chipperlyapp.com> (same build and API, super admins and support only, two-step sign-in) |
| Marketing site and blog | <https://chipperlyapp.com>, `apps/site`, CMS at `/admin` |
| Dev copies | <https://dev-app.chipperlyapp.com>, <https://dev-admin.chipperlyapp.com>, <https://dev.chipperlyapp.com>. Pages ask for a shared password (user `dev`); ask the team for it. |
| Ops panel | <https://ops.chipperlyapp.com>: sites, deployments, server metrics, logs, Cloudflare, rollbacks |
| Server | Contabo VPS, Ubuntu 24.04, 4 vCPU, 8 GB, `89.117.20.203`, SSH as `mhany` with a key. Runs live, dev, PostgreSQL 18, Caddy, the CI runner and the ops panel. `deploy/contabo/README.md` is its manual. |
| Cloudflare | The owner's account: DNS for `chipperlyapp.com`, the site Workers, D1, R2, email routing, the off-server backup bucket |
| Payments | Stripe, live keys on since 10 Oct 2026. Dev uses the sandbox. |
| Email | Resend, account tech@chipperlyapp.com, domain `chipperlyapp.com`. Separate send-only keys for live app, dev, site. |
| Push | Firebase (Android) and Web Push (VAPID) |
| Image search | Openverse |
| Product notes | [MAIN.md](MAIN.md) (history and links), [ROADMAP.md](ROADMAP.md) (the owner's notes, line by line) |

## Repo layout

```
apps/api          Fastify API, Drizzle ORM, PostgreSQL. Also serves the web build in production.
apps/web          Next.js App Router, static export, PWA, Capacitor (android/, ios/)
apps/site         Marketing site and blog: Next.js 16 + Payload 3 on a Cloudflare Worker (D1, R2)
apps/site/mail-worker   Email Worker for team addresses (chipperly-mail)
packages/shared   zod schemas, types, constants and pure helpers used by the API and the web app
e2e               Playwright tests (phone, tablet, desktop, iPad WebKit)
deploy/contabo    Server scripts: deploy.sh, deploy-dev.sh, rollback.sh, backup.sh, restore.sh, Caddyfile, systemd units
deploy/contabo/backup-worker   Worker that takes the nightly backup upload to R2
deploy/cloudflare, deploy/vm200  Older deployment plans, kept for reference
ops               The ops panel (plain Node, no dependencies)
docs              CONTRACTS.md, technical-plan.md, ux-plan.md, brand.md, COMMUNITY.md, import-rails.md
brand             Logos and lockups from the owner
.github/workflows CI, Deploy app, Deploy site
```

## How it fits together

- **Offline first.** The web app keeps a full copy of each account in IndexedDB and syncs with `/api/sync` in the background. Every change is a row with an id and a timestamp; the server refuses writes it cannot accept and keeps them for a super admin to look at (Sync health in the admin site). The rules are in `docs/CONTRACTS.md`. Read them before touching anything that syncs.
- **One process in production.** `node dist/server.js` serves the API under `/api/` and the static web export at `/` when `WEB_DIR` is set. The admin site is the same build on another host name; the page checks `NEXT_PUBLIC_ADMIN_URL` and the API checks the role on every admin route.
- **Accounts and people.** A person can belong to several accounts (Myself, family, someone I support, organization). Roles: owner, admin, member, viewer, plus moderators and groups in organizations. A 21-day trial belongs to the account owner; after it, new content pauses until someone subscribes.
- **Billing.** Stripe Checkout and the customer portal. Prices come from `STRIPE_PRICE_*`; an unset key turns billing off and the upgrade path disappears. Webhooks land on `/api/billing/webhook`. Community selling (Stripe Connect) is built but hidden until `COMMUNITY_PLATFORM_FEE_PERCENT` is set.
- **Media.** Uploads are compressed to WebP (pictures) and transcoded with ffmpeg (audio and video) and stored on disk (`UPLOAD_DIR`).
- **Reminders and push.** An in-process timer sends reminders. Setting `CRON_SECRET` on the app hands that to an outside cron that does not exist, so reminders stop: never set it on the app.
- **Marketing site.** Visitors never reach the server: the Worker answers from Cloudflare's cache, D1 and R2. It talks to the app only for the newsletter audience (`NEWSLETTER_API_SECRET`) and the admin site reads its waitlist (`ADMIN_LINK_SECRET`). Each pair is its own secret on both sides.

`docs/technical-plan.md` explains why the system is shaped this way. `docs/ux-plan.md` describes every screen (S1, S2 ...).

## Run it locally

Node 22 or newer and pnpm 11 (`corepack enable`).

```bash
pnpm install
cp apps/api/.env.example apps/api/.env       # set JWT_SECRET (32+ characters)
pnpm -F @chipperly/api db:start              # embedded PostgreSQL on 54329; the first run downloads it
pnpm -F @chipperly/api db:migrate
pnpm -F @chipperly/api dev                   # http://127.0.0.1:8080/api
pnpm -F @chipperly/web dev                   # http://localhost:3000
```

Without Stripe, Resend, Google, Apple, Firebase or Openverse settings the app still runs: each feature switches itself off, and email is printed to the API's console instead of sent. Every environment variable is listed in `docs/CONTRACTS.md` and `apps/api/src/env.ts` (each one has a comment saying what happens when it is unset).

The marketing site runs on its own with a local D1 and R2, no database to install:

```bash
cp apps/site/.env.example apps/site/.env     # PAYLOAD_SECRET and the SEED_ADMIN_* pair
pnpm -F @chipperly/site migrate
pnpm -F @chipperly/site seed                 # first admin, categories, settings, starter posts
pnpm -F @chipperly/site dev                  # http://localhost:3100, CMS at /admin
```

`apps/site/README.md` has the rest, including why OpenNext does not build on Windows and how to use Docker instead.

## Checks and tests

```bash
pnpm typecheck
pnpm lint
pnpm test                         # API (45 files, embedded PostgreSQL), web (74 files), site, shared
pnpm -F @chipperly/web build      # e2e drives the real export
pnpm e2e                          # all four device projects
pnpm e2e --project=phone e2e/specs/today.spec.ts   # one spec, one device
```

The e2e suite starts its own database and API on port 8123 and checks every screen for horizontal overflow and tap-target size at phone (390x844), tablet (820x1180), desktop (1440x900) and the owner's iPad (WebKit). The full run needs a few GB of free memory. `e2e/README.md` has the details.

## Branches, commits and CI

- Work on `dev` (or a branch off it). Push to `dev` and CI runs; if it passes, dev-app and dev.chipperlyapp.com are deployed automatically. Check your change there.
- When dev is right, merge `dev` into `main`. Pushing to `main` runs CI only. Nothing reaches live until someone runs a live deploy (next section).
- Commits are small and atomic, in Conventional Commits form: `feat(api): ...`, `fix(web): ...`, `test(e2e): ...`, `chore(deploy): ...`. The subject says what changes for a person, in plain words.
- CI runs on our own runner on the server (`contabo-chipperly`, label `chipperly`), capped at 2 CPUs and 4 GB so live keeps the rest. Jobs queue one at a time. Pull requests from forks never run on it, and every outside contributor's run waits for approval.
- The repo is public. No `.env` files, keys, passwords or licensed fonts in git. `git check-ignore` before adding anything that looks like configuration.

## Environments

| | Live | Dev |
| --- | --- | --- |
| App | app.chipperlyapp.com, `~/chipperly`, unit `chipperly`, port 8064 | dev-app.chipperlyapp.com, `~/chipperly-dev`, unit `chipperly-dev`, port 8065 |
| Admin | admin.chipperlyapp.com | dev-admin.chipperlyapp.com |
| Database | PostgreSQL `chipperly` (real families) | `chipperly_dev`, test data only, never a copy of live |
| Site | Worker `chipperly-site`, D1 `chipperly-site` | Worker `chipperly-site-dev`, D1 `chipperly-site-dev` (posts copied, no people data) |
| Stripe | live keys | sandbox (card 4242 4242 4242 4242) |
| Email | Resend live key | Resend `chipperly-dev` key, sender "Chipperly DEV" |
| Deploys | by hand, after an approval | every passing push to `dev` |
| Rollback | app: last 10 deploys; site: last 5 versions; other Workers: last 10 | none: push a fix to `dev` |

## Deploying to live

Live has real families on it. Before a live deploy, list every commit that goes out and send the owner a plain change list; nothing goes live that nobody asked for.

- **App and admin.** GitHub Actions, workflow "Deploy app", then approve the `production` environment. It backs up the database, runs `/usr/local/lib/chipperly/deploy.sh` on the server (pull `main`, install, build, migrate, restart) and checks that `/api/health` reports the new commit. By hand: `ssh mhany@89.117.20.203` then `bash /usr/local/lib/chipperly/deploy.sh`.
- **Marketing site.** Workflow "Deploy site", then approve. It migrates the live D1, builds with OpenNext and deploys the Worker and the mail Worker.
- **Rollback.** From the ops panel. The app can go back to one of its last 10 deploys, but only to one with the same database migrations as live, because the database is never rolled back; anything older needs a backup restore. Each rollback takes a backup first. The next "Deploy app" returns live to `main`. By hand: `bash /usr/local/lib/chipperly/rollback.sh <commit>`.
- Live runs the deploy and rollback scripts from `/usr/local/lib/chipperly/`, not from the checkout. After changing them, install them again (command in `deploy/contabo/README.md`).
- Every deploy and rollback is recorded in `/var/lib/chipperly-deploys/<unit>.log`.

## Backups and restore

The database and uploads are backed up every night at 03:17 server time to `~/backups/chipperly`, kept 30 days, with a copy in the R2 bucket `chipperly-app-backups`. Super admins can restore one account, or the whole database, from the admin site's Backups screen. Both take a backup first. Restoring the whole database has never been done on live; do not do it without the team lead's word. `deploy/contabo/README.md` covers backups, restore and rehearsing a restore on a scratch database.

## Ops panel

<https://ops.chipperlyapp.com> shows the six sites with their status and commit, every service's memory and CPU (24 hours of history), the GitHub Actions runs, the logs of each service with search and a live tail, and Cloudflare (Workers and rollbacks, Worker logs, DNS, D1 and R2, traffic, cache purge). It can restart the live or dev app and reload Caddy, and every change it makes is logged with the person's email. It has its own sign-in; ask the team lead for an account. Cloudflare Access will go in front of it once the owner switches Zero Trust on. Code in `ops/`, setup in `deploy/contabo/README.md` ("Ops panel").

## Secrets

None are in this repo. They live in:

- the server: `~/chipperly/apps/api/.env` and `~/chipperly-dev/apps/api/.env` (chmod 600), `/etc/ops/ops.env`, `/etc/caddy/dev-auth`, `~/.chipperly-backup.env`
- Cloudflare Worker secrets (`wrangler secret`), per Worker and per environment
- GitHub Actions secrets: `CLOUDFLARE_API_TOKEN`, `PAYLOAD_SECRET`, `PAYLOAD_SECRET_DEV`

The team lead keeps local copies. Before adding a variable to a live `.env`, grep every place that reads it: some change behaviour elsewhere (`CRON_SECRET` turns off reminders).

## Database changes

- **API.** Change the tables in `apps/api/src/db/schema/`, run `pnpm -F @chipperly/api db:generate`, check the new numbered SQL file in `apps/api/src/db/migrations/` (48 so far), and commit it. Migrations only go forward and run on every deploy. Keep them additive where you can: a rollback only works across deploys with the same migrations.
- **Site.** `pnpm -F @chipperly/site payload migrate:create <name>`, then `migrate`, and commit the file in `apps/site/src/migrations/`.

## Mobile apps

Capacitor wraps the web export (`apps/web/out`) as `org.chipperly.app`. Build the web app, run `npx cap sync android` (or `ios`) in `apps/web`, then build from Android Studio or Xcode. Some behaviour only exists in the native app (the "Who uses this device?" question, native push), so check those changes on a phone.

## Knowledge graph

A map of the backend and infrastructure code (API, shared package, deploy scripts, ops panel, docs) can be built with [graphify](https://github.com/safishamsi/graphify): run `/graphify` in Claude Code, or `graphify` from the repo root. It writes `graphify-out/` (git-ignored): `graph.html` to browse, `GRAPH_REPORT.md` for the main modules and how they connect, `graph.json` for tools.

## Things to know

- Real families use the live app. The database is not a throwaway; test on dev.
- Do not kill processes on the server. Restart with `sudo systemctl restart chipperly` (or `chipperly-dev`, `ops`).
- The admin site always asks for an authenticator code (`ADMIN_TWO_STEP`). Only a local or test server turns it off.
- Google and Apple sign-in are built but stay hidden until their client ids are set.
- Browser errors from signed-in sessions land in the server log: `journalctl -u chipperly | grep client_error`.
- The old Rails app is <https://github.com/samplep182/chipperly>; `docs/import-rails.md` is the importer.

## People

- Build, infrastructure and this repo: Muhammad Hany (team lead).
- Client and product decisions: Taymar Pixley, Chipperly LLC. She owns the Cloudflare account and is its only Super Administrator.
