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
