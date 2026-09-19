# Chipperly: start here

One page with every link. Written 19 Sept 2026; keep it current when something moves.

## What it is

Visual supports for neurodivergent children (Today schedule, chip board, timer, first-then, social stories, Chipper Chart), used by parents, teachers and therapists and, in a locked view, by the child. Client: Chipperly LLC (Taymar Pixley, Tucson). Built by Cooperation-org as an offline-first PWA (Next.js static export) on a Fastify + Postgres API. MIT licence, public repo.

## Where things live

| What | Where |
| --- | --- |
| Code | <https://github.com/Cooperation-org/chipperly> (`main` is the only branch; every push runs CI) |
| Demo | <https://demos.linkedtrust.us/chipperly-next/> on the shared dev VM 200 (`/home/mhany/chipperly`, units `tmp-chipperly-next` + `tmp-chipperly-next-db`, nginx `/etc/nginx/app-proxies/chipperly-next.conf`). Registry row `chipperly-next` in `Cooperation-org/cobox/app-registry.md`. Not the old Rails demo (`chipperly`, golda's) |
| Demo sign-in | invite code for new accounts is `chipper-demo` (`BETA_INVITE_CODE`); the shared test login is in the team channel, not here |
| Owner's feedback doc | "Notes on App So Far", Google Doc (link in the team channel); turned into [ROADMAP.md](ROADMAP.md) |
| Owner's brand files | `brand/` (logo SVGs, lockups, favicon package); the brand kit PDF is in her Drive share |
| Old Rails app | <https://github.com/samplep182/chipperly> (`db/schema.rb` copied to `docs/reference/rails-schema.rb`; notes in `docs/reference/rails-app-analysis.md`); the importer is `docs/import-rails.md` |
| Docs | `docs/CONTRACTS.md` (names, shapes, env vars, sync rules: read before changing code), `docs/technical-plan.md` (why the system is shaped this way, production layout), `docs/ux-plan.md` (every screen), `docs/brand.md` (colours, fonts) |
| CI | GitHub Actions, `.github/workflows/ci.yml`: typecheck, lint, unit tests, build, then Playwright at phone / tablet / desktop |

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

## Deploy the demo

```bash
ssh linkedtrust                                              # VM 200, user mhany
bash /home/mhany/chipperly/deploy/vm200/deploy.sh            # pull main, install, build, migrate
sudo systemctl restart tmp-chipperly-next                    # pick up the new API build
curl -s http://127.0.0.1:8064/chipperly-next/api/health
```

`deploy/vm200/README.md` covers the root steps, removal and the database. Production is not set up: it goes on a dedicated app VM once the client approves our hosting (`docs/technical-plan.md` section 10; `scripts/deploy.sh` is the reference sequence).

## Things to know before demoing

- Email is off on the demo (no `RESEND_API_KEY`), so verification, password-reset and invite mails only print to the API log. Invites still work: the sheet shows the accept link to copy and send by hand, and says so. Set the key in `apps/api/.env` and restart to turn mail on.
- Google and Apple sign-in are built but hidden until their client ids are set.
- Sign-up is closed behind the invite code; care-team invitees never need it.
- The demo database is a throwaway embedded Postgres; anything typed in can vanish on a rebuild.

## People

- Build and this doc: Muhammad Hany (`mhany` on the VM).
- VM and org infra: golda.
- Client: Taymar Pixley, Chipperly LLC.
