# Chipperly

A routines, rewards and chip-board app for kids, built with a Next.js PWA
frontend and a Fastify + Postgres API. Offline-first: the web app keeps a
full local copy of each profile in IndexedDB and syncs in the background.

## Packages

- `packages/shared` - zod schemas, types, constants and pure helpers shared by the API and the web app.
- `apps/api` - Fastify API, Drizzle ORM, Postgres.
- `apps/web` - Next.js App Router, static export, installable PWA.
- `e2e` - Playwright end-to-end tests.

## Running it

```bash
pnpm install

# one-time: local Postgres for dev
pnpm -F @chipperly/api db:start
pnpm -F @chipperly/api db:migrate

# dev servers (separate terminals)
pnpm -F @chipperly/api dev
pnpm -F @chipperly/web dev

# checks
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm e2e
```

Copy `apps/api/.env.example` to `apps/api/.env` and fill in `JWT_SECRET`
before running the API. See `docs/CONTRACTS.md` for every environment
variable and `docs/technical-plan.md` for how the pieces fit together.

## Production shape

One Node process: the API serves the static export from `apps/web/out` when
`WEB_DIR` is set, so nginx or Caddy only needs to proxy one port. Build with
`GIT_SHA` set (the service worker uses it as its precache revision), run
migrations with the owner role, then start `node dist/server.js` under
systemd. `scripts/deploy.sh` is the reference sequence and
`docs/technical-plan.md` section 10 has the systemd unit, nginx location
blocks and the health-check cron. Nothing in this repo deploys on its own.

## Tests

- `pnpm test` runs the unit suites. The API tests start an embedded Postgres
  on port 54329 the first time (downloads the binaries once).
- `pnpm e2e` builds nothing; run `pnpm -F @chipperly/web build` first. The
  suite boots its own database and API on port 8123 and drives the real
  export at phone (390x844), tablet (820x1180) and desktop (1440x900)
  sizes, checking every screen for horizontal overflow and tap-target size.
  Screenshots land in `e2e/screenshots/<project>/`.
