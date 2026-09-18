# Chipperly rebuild: technical plan

Status: plan only. Nothing deployed. Written 17 Sept 2026.

Inputs: the reference Rails app at `reference-lovable/` (graph in `reference-lovable/graphify-out/`), the client feedback in `reference-lovable/PLAN-9-16.md`, the live features page, and the Cooperation-org cobox conventions (`shared-dev-vm-best-practices.md`, `app-vm-best-practices.md`, `platform-vm-best-practices.md`, `new-app-checklist.md`, `postgres-access.md`, `oauth-login-pattern.md`, `backup-strategy.md`).

## 1. Decisions

| Question | Decision |
| --- | --- |
| Backend | Node API on a shared-Postgres database (VM 100). No self-hosted Supabase: it bundles its own Postgres and eight containers, which breaks the one-shared-DB rule and needs ~4GB RAM. |
| Frontend | Next.js (App Router, `output: 'export'`), React, TypeScript. Ships as static files served by nginx; no Node process for the frontend, so the memory concern in `platform-vm-best-practices.md` does not apply. The static export is also what Capacitor needs. |
| Delivery | Installable PWA. Store apps (Capacitor) are undecided; the code stays Capacitor-compatible so that door stays open. |
| Offline | Offline-first. Client owns a local database; every read and write is local; a sync worker exchanges changes with the server. |
| Hosting | Develop and demo on VM 200 under `demos.linkedtrust.us/chipperly/`. Production host undecided. The app must run under a configurable base path. Do not deploy until told. |
| Billing | Out of scope. No Stripe, no plans table, no pricing page. |
| Media storage | Disk on our server, dev and production. The `s3` driver stays in the code for R2 or B2 if Chipperly ever wants a CDN or has their own bucket. Media on disk must be added to the org backup job (VM disk backups are not implemented yet per `backup-strategy.md`). |
| Media compression | Server-side pipeline ported from `media-pipeline/` (sharp to WebP, ffmpeg to 720p MP4) so stored objects stay small whatever the client uploads. |
| Sounds | We supply them: open-licensed clips or generated. Not a client question. |
| Sign-in providers | Google required (team rule). Sign in with Apple is implemented but rendered only when its env vars are set. |
| SEO and analytics | Public routes are prerendered with full meta, `robots.txt`, `sitemap.xml`, and hooks for Google Search Console, GA4, and Microsoft Clarity, all env-gated. Authenticated and share routes are `noindex`. Blog and blog CMS are out of scope. |
| Data migration | None. The reference app is in waitlist mode with no real users. Only the default activity and reward lists carry over, as seed data. |

## 2. What the reference app has, and what is missing

Built and working in the Rails app: signup, login, email verification, password reset, onboarding (who / profile / PIN), dashboard, My Day (day/month/year, add event, edit time, reorder, delete), chip board (per location, goal 1-20, +/- and tap-to-set, pick reward), timer (6 presets, ring, localStorage), first-then, activities / rewards / locations CRUD with photo upload and crop, profiles CRUD, PIN lock, care team invites, admin panel, Stripe.

Missing, partial, or wrong (each of these becomes a v1 requirement):

| Gap | Where it shows |
| --- | --- |
| No check-off on My Day. `completed_at` exists in the API only. | `schedule/day.html.erb` has move/edit/delete, no complete |
| Routines with steps: tables and API only, no screens | `routines`, `routine_steps`, `routine_step_completions` |
| Recurrence: model and API only. Web never calls `generate_recurring_events_for` | `ScheduleController#index` |
| Chip value on activities: column exists, not in any form | `activities.chip_value` |
| Chip board goal is a separate number, not tied to reward cost | `token_board_state.goal` vs `rewards.chip_cost` |
| Choice board: table with no photo, no location, no screen | `choice_options` |
| Social stories: global, admin-authored, read-only for users. Client wants per-profile authoring with photos | `admin/social_stories` |
| Share link `/s/:token` is a stub: renders name + "content scope to be determined" | `shared_access/show.html.erb` |
| Screentime control: advertised on the features page, no code anywhere | `pages/features.html.erb` |
| Chipper attitude chart, sound effects, image-reveal timer: shown in demo videos, absent from this codebase | everywhere |
| Timer: presets only, no typed duration | `timer/show.html.erb` |
| First-then auto-populates a confusing default | client feedback |
| Location is a string key, not an entity. Renaming a location orphans rewards, activities, and board state | `activities.location`, `rewards.location`, `token_board_state` keys |
| `account_memberships.first` everywhere: a user in two accounts is bound to the wrong one | `Authentication#set_current_account`, `Api::BaseController` |
| API token never expires, no refresh, no revocation except logout | `sessions.api_token` |
| Web and API duplicate the same logic (token board switch, care team transfer, first-then) | `TokenBoardController` vs `Api::V1::TokenBoardsController` |
| Likely nil bug in story viewer (`@social_story` vs `@story`) | `social_stories/show.html.erb` |
| PWA manifest is a placeholder (theme color "red"), service worker is empty. Zero offline | `pwa/` |
| Care team invite email reported broken (Resend config) | client feedback |
| README says SQLite, Gemfile says Postgres | docs drift |

## 3. What changes to fit cobox

| Reference app | cobox way | Why |
| --- | --- | --- |
| Rails + Kamal + Docker on one DigitalOcean droplet | Node under systemd on an app VM, deployed by GitHub Actions. No containers, no pm2. | `app-vm-best-practices.md`: "systemd only", "Deploy from CI/CD. No manual SSH deploys." |
| SQLite or local Postgres | Database `chipperly` on VM 100 with two roles: `chipperly_owner` (migrations) and `chipperly_user` (runtime) | `postgres-access.md`. Nightly pg_dump to B2 already covers every DB on VM 100 (`backup-strategy.md`). |
| Rails encrypted credentials | `.env` on the VM, `chmod 600`, in `.gitignore` | Team rule. |
| Email + password only | Google sign-in via the team's `POST /api/auth/google` contract, plus email + password | `oauth-login-pattern.md`: "Email+password as the only option is not acceptable." |
| Bearer token that never expires | Short-lived access JWT (15 min) + rotating refresh token stored hashed in `sessions`, revocable | Same contract shape as the team's other apps (`access_token`, `refresh_token`, `expires_in`). |
| Absolute paths, no base path | `NEXT_PUBLIC_BASE_PATH` env, `basePath` in `next.config.ts`, API under `${basePath}/api` | Demos are path-prefixed under `demos.linkedtrust.us/<slug>/`. alonovo is the precedent. |
| Rails `/up` | `GET /health` returning DB status, plus cron watchdog | `app-vm-best-practices.md` health check section. |
| Active Storage on a Docker volume, originals stored as uploaded | `storage` module with a local-disk driver (default) and an S3-compatible driver (optional); every upload passes through the media pipeline first | Disk on our own server is what we have. Compression keeps it small. On VM 200 uploads are throwaway because the VM can be reset. |
| Admin CMS for defaults | Seed file | Defaults change rarely; a CMS is scope with no user. |
| Server-rendered Hotwire | Static SPA + service worker + local DB | Offline-first is impossible with server rendering. |

Slug: `chipperly`. Used for the systemd unit, DB name, deploy path, nginx conf, and registry row.

## 4. Repository layout

One repo, pnpm workspaces.

```text
chipperly/
  apps/
    web/          Next.js (App Router, static export), Serwist, Dexie, Capacitor
    api/          Fastify, Drizzle ORM, postgres.js, zod, media pipeline (sharp + ffmpeg)
  packages/
    shared/       zod schemas + TS types for every synced table and API payload (used by both apps)
  scripts/
    deploy.sh     git tag, pull, pnpm ci, migrate, restart (for later)
  .github/workflows/
    ci.yml        typecheck, vitest, playwright smoke
    deploy.yml    (disabled until hosting is decided)

```

### Repository

`Cooperation-org/chipperly`, public, created only when the build starts (nothing is created or pushed before the go-ahead). The name is free and the org allows public repos. Consequences of being public:

- `.env*`, `apps/web/.env.production`, `UPLOAD_DIR` contents and the licensed font files (Altone, Code Pro LC) are in `.gitignore`. `app/fonts.ts` falls back to the stand-ins when the files are absent; the deploy script copies the licensed files into `apps/web/app/fonts/` from a private location on the VM before `next build`.
- A license file is needed before the first push. Choice belongs to Chipperly (MIT or Apache-2.0 if they are fine with open code; otherwise the repo should be private). This is added to the SOW questions.
- Brand assets (logo PNG/SVG) are committed only with Chipperly's OK, since a public repo republishes them.

Commits: atomic, one logical change each, Conventional Commits (`feat(api): sync pull endpoint`, `chore: pnpm workspace`, `test(shared): schema round-trip`). No generated attribution trailers. Phase 0 as a commit sequence:

1. `chore: pnpm workspace, editorconfig, nvmrc, gitignore, license`
2. `feat(shared): zod schemas and types for synced tables`
3. `feat(api): fastify skeleton with /health and env loading`
4. `feat(api): drizzle schema, migrations, sync version triggers`
5. `feat(web): next app shell, static export, base path`
6. `feat(web): dexie schema mirroring shared`
7. `feat(web): sync loop skeleton (pull/push no-op)`
8. `ci: typecheck, lint, build, vitest on pull requests`

`packages/shared` is the one place a table shape is defined. The API validates against it, the client stores against it, and the sync protocol serializes it. Drizzle schema in `apps/api` imports the same enums.

## 5. Data model

Design rule: everything a child or caregiver does often is append-only (chip ledger, completions, attitude checks). Append-only rows never conflict. Everything else is row-level last-writer-wins.

Every profile-scoped table carries the sync columns:

```text
id                uuid        client-generated UUIDv7 (sortable, no server round-trip to create)
profile_id        uuid        partition key for sync
version           bigint      server-assigned from one global sequence, set by trigger on insert/update
client_updated_at bigint      ms timestamp from the writing device, used for LWW
updated_by        uuid        user id
deleted_at        timestamptz soft delete; rows are never hard-deleted while any client might still hold them

```

### Tenancy

```text
accounts          id, kind (individual|household|agency), name, created_at
users             id, email (unique, lowercased), password_hash (nullable), auth_provider, auth_provider_id,
                  display_name, pin_hash (nullable), email_verified_at
account_members   account_id, user_id, role (admin|member), PK (account_id, user_id)
profiles          id, account_id, name, avatar_emoji, avatar_photo_id, share_token (nullable, unique),
                  first_then_activity_id, first_then_reward_id, settings jsonb, + sync cols
profile_members   profile_id, user_id, relationship_label   (which profiles a `member` can see)
invites           id, account_id, email, role, profile_ids uuid[], relationship_label, token_hash,
                  expires_at, accepted_at, invited_by
sessions          id, user_id, refresh_token_hash, device_id, user_agent, expires_at, revoked_at

```

Profile limits by account kind: individual 1, household 8, agency unlimited. Same as the reference.

A user can belong to several accounts. The client stores `active_account_id` locally and sends it as `X-Account-Id`; the API checks membership on every request. This removes the `account_memberships.first` bug.

### Content (all profile-scoped, all synced)

```text
locations         id, profile_id, name, emoji, photo_id, position,
                  chip_goal int (default 5), working_for_reward_id (nullable)
activities        id, profile_id, name, emoji, photo_id, chip_value int (default 0),
                  location_id (nullable = everywhere), recurrence (null|daily|weekdays|weekends|weekly),
                  recurrence_weekday smallint (for weekly), recurrence_time time (nullable), position
activity_steps    id, activity_id, position, name, emoji, photo_id
                  (an activity with steps is a routine; no separate routines table)
recurrence_skips  id, activity_id, date            (one row per suppressed occurrence, append-only)
schedule_items    id, profile_id, date, position, activity_id, start_time (nullable),
                  part_of_day (null|morning|afternoon|evening), source (manual|recurring),
                  completed_at, completed_by
step_completions  id, schedule_item_id, activity_step_id, completed_at, completed_by
rewards           id, profile_id, name, emoji, photo_id, chip_cost int (nullable),
                  location_id (nullable = everywhere), always_available bool (default false), position
chip_ledger       id, profile_id, location_id (nullable), delta int,
                  reason (task|step|manual|redeem|adjust), ref_id (nullable), created_at, created_by
social_stories    id, profile_id, title, emoji, cover_photo_id, position
story_pages       id, story_id, position, text, emoji, photo_id
attitude_checks   id, profile_id, schedule_item_id (nullable), value (good|grumpy), created_at, created_by
mood_events       id, profile_id, date, delta int (-10..10), level_after int (-5..5), created_at, created_by
                  (append-only; Chipper Chart. The day's level is level_after of the newest row for that date, or 0.)
media             id, account_id, kind (image|video), status (processing|ready|failed), storage_key,
                  content_type, width, height, duration_ms (nullable), bytes, original_bytes, created_by, created_at

```

Derived, never stored: chip balance per location = `sum(delta) where location_id = X or location_id is null`. Board fill = balance vs `locations.chip_goal`, or vs `rewards.chip_cost` when `working_for_reward_id` is set (this closes the "goal not tied to reward" gap).

Two modeling choices made here that the client should confirm (they are also in the SOW):

1. Rewards and the choice board are one table. `always_available = true` means "free-time choice, costs nothing". The client's own doc suggested this merge.
2. Routine steps are free-text rows on an activity, not references to other activities. Simpler to author, and steps with photos still work.

`profiles.settings` is reserved for future per-profile settings and currently empty; screentime control ships as default rewards (below) and the Chipper Chart (SOW Q5, resolved to match the client's beta) writes to its own `mood_events` table, not `attitude_checks`.

### Seed data

Copy `Profile::DEFAULT_ACTIVITIES` (30) and `DEFAULT_REWARDS` (18) from `reference-lovable/app/models/profile.rb` into `apps/api/src/seed/defaults.ts`. On profile create, insert them for that profile. Screen-time rewards in the defaults are how "screentime control" is delivered in v1 unless the client says otherwise.

## 6. Sync protocol

Server holds the truth. Clients hold a full copy of every profile they can access. Sync is per profile.

### Pull

```text
GET /api/sync/pull?profile_id=<uuid>&since=<version>
→ 200 {
    changes: { locations: [...], activities: [...], ...one array per synced table... },
    version: <max version seen>,
    hasMore: bool
  }

```

Server returns every row with `version > since` for that profile, including soft-deleted rows, page size 500. Client upserts each row into Dexie, replacing the local row if the incoming `client_updated_at >= local.client_updated_at` or the local row has no pending outbox entry. Client stores `version` as the new cursor for that profile.

First sync is `since=0`.

### Push

```text
POST /api/sync/push
{ profile_id, mutations: [ { table, id, op: "upsert"|"delete", row, client_updated_at } ] }
→ 200 { applied: [id...], rejected: [ { id, reason, server_row } ], version }

```

Server, in one transaction per request:

1. Checks the user can write to `profile_id`.
2. For each mutation: if the table is append-only (`chip_ledger`, `step_completions`, `attitude_checks`, `recurrence_skips`), insert if the id is new, otherwise no-op. For LWW tables, apply if `incoming.client_updated_at >= stored.client_updated_at`, otherwise reject and return the server row.
3. `version` is set by the trigger; the response carries the new max so the client can advance its cursor without a second pull.

Rejected rows overwrite the local copy and the outbox entry is dropped. The client shows nothing for this in v1; a caregiver's edit losing to a slightly later edit by another caregiver is acceptable for schedule and reward data. Chips and completions never lose because they are append-only.

### Triggers

One Postgres sequence `sync_version_seq`. One trigger function `set_sync_version()` that does `NEW.version = nextval('sync_version_seq'); NEW.updated_at = now();`, attached `BEFORE INSERT OR UPDATE` on every synced table. Index `(profile_id, version)` on each.

### Client loop

```text
on app start        → pull every accessible profile
on write            → write to Dexie + append to outbox, then schedule push (debounce 500ms)
on online event     → push outbox, then pull
on visibilitychange → same
every 60s while visible → same

```

Outbox is a Dexie table `{ id, table, op, row, client_updated_at, attempts }`. Push sends in insertion order. A 401 pauses the loop and shows the sign-in sheet; a 5xx backs off exponentially to 5 minutes.

### Clock

`client_updated_at` is `Date.now()` adjusted by the server offset learned from the `Date` header on the last successful response. Good enough for LWW between caregivers. Not a hybrid logical clock; upgrade if we see real problems.

## 7. Client architecture

```text
apps/web/
  next.config.ts      output 'export', basePath, trailingSlash, images.unoptimized, Serwist wrapper
  app/
    layout.tsx        Server Component: <html>, font variables, metadata, <Providers>
    fonts.ts          next/font setup (the one file that changes when licensed fonts arrive)
    manifest.ts  robots.ts  sitemap.ts   generated at build by the Metadata API
    sw.ts             Serwist service worker source
    (public)/         /, login, sign-up, invite, share: rendered to HTML at build
    (caregiver)/      layout with sidebar + <RequireSession>; today, chips, timer, first-then, stories, settings, ...
    (child)/          layout without sidebar + PIN lock check; the locked profile view
  components/
    ui/               Button, Sheet, Card, Chip, Tile: plain CSS Modules, no UI kit
    <feature>/        colocated feature components ('use client' lives here)
  lib/
    db/               Dexie schema (mirror of packages/shared), useLiveQuery hooks, outbox
    sync/             pull/push loop, cursor store, conflict apply
    api/              fetch wrapper: base path, auth header, refresh on 401, X-Account-Id
    auth/             session store, Google Identity Services, PIN lock state
    media/            pick -> client pre-resize (max 1600px, JPEG q0.85) -> store blob locally -> upload queue
    timer/            TimerState (port of the reference's timer_state.js), image reveal, end sound
  public/
    icons/  sounds/
```

Reads come from Dexie via `useLiveQuery` (`dexie-react-hooks`), never from the network. Screens never wait on a request. The sync loop runs in the page (no background sync API; iOS does not support it) and in a Web Worker only if the main thread stutters, which is unlikely at this data size.

### Next.js rules for this app

These are the Next conventions that matter for a static, offline-first export. Each one is a place where the default Next mental model (server-rendered, dynamic) would be wrong here.

1. **Static export, no server code.** `output: 'export'`. No Server Actions, no dynamic Route Handlers, no `proxy.ts`/middleware: none of them exist in an export. Every network call goes to the Fastify API. The frontend build is a folder.
2. **Server Components for the shell, Client Components at the feature boundary.** `app/layout.tsx`, the route-group layouts and the public pages are Server Components; they render to real HTML at build, so the login page and the share page work without JS and crawlers see markup. Anything that reads Dexie or holds state is a Client Component. `'use client'` goes on the feature component (`TodayList`, `ChipBoard`), not on the page file. Pages compose, they do not fetch.
3. **No dynamic segments.** An export must enumerate every `[param]` route at build with `generateStaticParams`, and our ids are user data. Entity pages are static routes with a query param: `/activity/edit/?id=<uuid>`, `/story/?id=...`, `/invite/?token=...`, `/share/?token=...`. Read it with `useSearchParams()` inside a `<Suspense>` boundary (required in export mode; without it the whole page falls back to client rendering).
4. **Data flows from Dexie, not from fetch-in-effect.** `useLiveQuery` is the read API for every screen. No `useEffect` + `fetch`, no React Query, no global store: Dexie is the store and live queries are the subscriptions. A `'use client'` `<SyncProvider>` in the root layout starts the sync loop once; it writes into Dexie and the UI re-renders through live queries. `useState` is for UI-only state (open sheet, drag position, timer tick).
5. **Auth guard is a client layout, not middleware.** `(caregiver)/layout.tsx` wraps children in `<RequireSession>`: reads the session from Dexie, renders nothing until known, `router.replace('/login')` when absent. `(child)/layout.tsx` does the same and also checks the PIN lock state. Real enforcement is server-side (section 9); this is UX.
6. **Fonts through `next/font`.** See Fonts below. No `<link>` to Google Fonts anywhere.
7. **Images.** `images.unoptimized: true` (an export has no optimizer). Media comes from `/api/media/<id>` already compressed by the pipeline (7b), so a plain `<img>` with `width`, `height`, `loading="lazy"` is enough. No `remotePatterns` config.
8. **Metadata API for SEO.** `export const metadata` on each public page; `app/robots.ts`, `app/sitemap.ts`, `app/manifest.ts` are generated at build. Private routes set `robots: { index: false, follow: false }`. Analytics tags go through `@next/third-parties/google` (`<GoogleAnalytics>`) and a `<Script strategy="afterInteractive">` for Clarity, rendered only in `(public)/layout.tsx` and only when the env var is set (7c).
9. **Env is build-time.** Everything the browser needs is `NEXT_PUBLIC_*` and inlined at build: base path, API origin, analytics ids. One build per environment. No secret ever lives in `apps/web`.
10. **`trailingSlash: true`.** The export writes `today/index.html`, nginx serves it with `try_files $uri $uri/ =404` and no rewrite rules, and Capacitor's local file server resolves the same paths.
11. **Hygiene.** `strict: true` TypeScript, `eslint-config-next` (`core-web-vitals`), `reactStrictMode: true`, Turbopack for dev and build. No barrel `index.ts` files (they slow the build and defeat tree-shaking; import from the file). `@next/bundle-analyzer` is a dev dependency for `ANALYZE=1 pnpm build`, not a CI gate.

### Recurrence on the client

`schedule_items` with `source = recurring` are materialized on the client when a day is opened, same idea as the reference's `generate_recurring_events_for`, then pushed like any other row. Idempotency: id is `uuidv5(activity_id + date)` so two devices materializing the same day produce the same id and the server treats the second as a no-op. `recurrence_skips` suppress an occurrence.

### Fonts

Brand faces are **Altone** (headings) and **Code Pro LC** (body and labels), per `brand/Chipperly App Brand Kit.pdf`. The PDF embeds only subsets (Altone Bold has 8 glyphs), so the client must supply licensed WOFF2/OTF files; "Altone Trial" cannot ship. Until then the stand-ins from the Stitch mockups (Outfit, Montserrat) are the shipped look.

```ts
// app/fonts.ts: the only file that changes when the licensed files arrive
import { Outfit, Montserrat } from 'next/font/google'; // downloaded at build, self-hosted, no runtime request to Google

export const heading = Outfit({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-heading', display: 'swap' });
export const body = Montserrat({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-body', display: 'swap' });

// then:
// import localFont from 'next/font/local';
// export const heading = localFont({
//   src: [{ path: './fonts/Altone-Regular.woff2', weight: '400' }, { path: './fonts/Altone-Bold.woff2', weight: '700' }],
//   variable: '--font-heading', display: 'swap',
// });
// export const body = localFont({ src: [...CodePro files], variable: '--font-body', display: 'swap' });
```

`app/layout.tsx` puts `${heading.variable} ${body.variable}` on `<html>`; CSS uses `font-family: var(--font-heading)`. `next/font` hashes the files into `_next/static/media`, computes `size-adjust` for the fallback so there is no layout shift, and the service worker precaches them with the rest of `_next/static`, so headings do not reflow offline. Licensed files go in `app/fonts/`, not `public/`, so they are bundled and hashed like the stand-ins.

### PWA

`@serwist/next` wraps `next.config.ts` (`withSerwist({ swSrc: 'app/sw.ts', swDest: 'public/sw.js', register: false, disable: dev })`) and injects the precache manifest at build. Two export-mode details:

- The injected manifest covers `_next/static/**` but not the exported HTML pages. `next.config.ts` builds `additionalPrecacheEntries` by walking `app/**/page.tsx` (every route is static, so the list is known before the build) with `revision` = git SHA.
- Entity pages are reached with `?id=`; `precacheOptions.ignoreURLParametersMatching: [/.*/]` so `/activity/edit/?id=...` matches the precached `/activity/edit/index.html` offline.

`app/sw.ts` runtime caching, in order:

- `/api/media/` -> `CacheFirst`, `ExpirationPlugin({ maxEntries: 500, maxAgeSeconds: 1y })` (objects are immutable by id)
- `/api/` -> `NetworkOnly` (the app never reads API data directly; sync does)
- everything else is precached; no `defaultCache` (its `/api/` NetworkFirst rule would cache sync responses)
- `skipWaiting: false`. A `<SwRegister>` client component registers `${basePath}/sw.js` with `scope: ${basePath}/`, listens for `waiting`, shows "Update ready" and calls `messageSkipWaiting()` on tap so an update never reloads mid-task.

`app/manifest.ts` returns the manifest from the Metadata API: real icons (512, 192, maskable), `display: standalone`, theme color from the brand kit, `start_url` and `scope` = `${basePath}/`.

### Base path

`NEXT_PUBLIC_BASE_PATH` (default empty). `next.config.ts`: `basePath` and `assetPrefix` from it. `next/link`, `useRouter` and `next/font` prefix automatically; raw `<img src>`, `fetch` and the service worker registration do not, so `lib/api` and a `withBase()` helper own those. API client prefixes `${NEXT_PUBLIC_API_ORIGIN}${basePath}/api`; in the browser build the origin is empty (same-origin). Capacitor builds with `NEXT_PUBLIC_BASE_PATH=` (root) and `NEXT_PUBLIC_API_ORIGIN=https://<api host>`.

### Capacitor (only if Chipperly wants store apps)

Undecided. Until it is, two rules keep the option cheap: no browser-only API without a fallback (Web Share, Notifications, File System Access are all optional paths), and the build must work with `NEXT_PUBLIC_BASE_PATH=` (root) and an absolute `NEXT_PUBLIC_API_ORIGIN`.

If the answer is yes: `pnpm -F web build` (writes `apps/web/out/`, which is `webDir` in `capacitor.config.ts`), `npx cap add ios android`, `npx cap sync`. Plugins: `@capacitor/preferences` (PIN lock and active profile), `@capacitor/camera` (take a photo, a client ask), `@capacitor/local-notifications` (timer finished while backgrounded), `@capacitor/app` (deep links for `/invite/:token` and `/share/:token`). Universal links need association files on the production domain, so this waits on hosting. Store signing and review are an ops task outside this doc.

Apple requires Sign in with Apple when any third-party sign-in is offered inside an iOS app. `POST /api/auth/apple` and its button are built regardless (see section 8) and appear only when `APPLE_SIGNIN_*` vars are present, so nothing in the code changes if the store decision comes late.

## 7b. Media pipeline

Port of `media-pipeline/compress-images.js` and `compress-videos.js` into `apps/api/src/media/`. Same settings, same tools.

| Input | Step | Output |
| --- | --- | --- |
| Any image (jpg, png, heic, webp, gif) | `sharp().rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 })` | one WebP, EXIF stripped, orientation applied |
| Any video (mp4, mov, webm, mkv) | `ffmpeg -vf "scale='min(iw,-2)':'min(720,ih)':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2" -c:v libx264 -preset medium -crf 26 -c:a aac -b:a 128k -movflags +faststart` | one 720p MP4, never upscaled, streams before fully downloaded |

Images run inline in the request (sharp is fast). Videos run in a small in-process queue (`p-queue`, concurrency 1) because ffmpeg is CPU-heavy and VM 200 is shared; the `media` row starts as `processing` and the client picks it up on the next sync. If video becomes a real feature the queue moves to its own systemd unit on the app VM.

Storage driver is three functions: `put(key, stream, contentType)`, `get(key)`, `delete(key)`. Keys are `<account_id>/<media_id>.<ext>`. Objects are immutable; a re-upload is a new id.

- `local` (default): writes under `UPLOAD_DIR`. In production that is a directory on the app VM's disk, served by the API with long cache headers. We have no Cloudflare account, and our own disk is what we have; with everything compressed a child's whole photo library is a few tens of MB.
- `s3` (optional): any S3-compatible bucket via `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `MEDIA_PUBLIC_BASE`. Stays in the code for R2 (if Chipperly has or wants Cloudflare) or B2 (already used by the org for backups). Switching is an env change.

Backup consequence of `local`: `backup-strategy.md` covers Postgres on VM 100 nightly, but VM disk backups are marked not implemented. `UPLOAD_DIR` therefore needs its own nightly job: a restic run from the backup controller (VM 518) pulling the directory over SSH, or an `rclone sync` to the existing B2 bucket. Put this in the ops note and in `app-registry.md` when prod is set up. Without it, a disk failure loses every photo.

ffmpeg must be on the PATH of the API host: `apt install ffmpeg`. It is in the setup steps.

## 7c. SEO and analytics readiness

The marketing site stays on Vercel. This is about the app's own public surface so that Search Console, GA4, and Clarity can be attached the day Chipperly wants them, and so nothing private leaks into an index.

Public routes (`/`, `/login`, `/sign-up`, `/about` if we host one, the `/invite/` shell) are Server Components rendered to HTML at build, so crawlers get real markup. Each exports `metadata` (title, description, `alternates.canonical`, Open Graph, Twitter); `/` also renders a JSON-LD `SoftwareApplication` script. `metadataBase` is set once in the root layout from `NEXT_PUBLIC_SITE_ORIGIN`; no per-page hand-written head.

Generated at build:

- `app/robots.ts`: allow `/`, disallow the caregiver and child route groups, `/share/`, `/api/`; `sitemap` field set.
- `app/sitemap.ts`: the public routes only, `lastModified` from the build.
- `/share/` and everything under `(caregiver)` and `(child)` export `metadata.robots = { index: false, follow: false }`.

Env-gated tags, rendered only on public routes and only when the var is set:

| Var | What it renders |
| --- | --- |
| `NEXT_PUBLIC_GSC_VERIFICATION` | `metadata.verification.google` on `/` |
| `NEXT_PUBLIC_GA4_MEASUREMENT_ID` | `<GoogleAnalytics gaId>` from `@next/third-parties/google`, no ads features |
| `NEXT_PUBLIC_CLARITY_PROJECT_ID` | Clarity snippet via `<Script strategy="afterInteractive">` |

Analytics never load inside the authenticated app or the child view. This is a children's app; behavior data and session recordings do not mix. If Chipperly later wants in-app product analytics, that is a separate decision with a consent flow, not a flag flip.

Blog and blog CMS: out of scope. If Chipperly wants a blog later, the cobox way is Hugo or Ghost on the platform VM, not inside this app.

## 8. API surface

All under `${basePath}/api`. JSON. Access token in `Authorization: Bearer`. `X-Account-Id` on account-scoped calls.

```text
Auth (public)
  POST /auth/register          email, password, display_name → tokens
  POST /auth/login             email, password → tokens
  GET  /auth/providers         { google: bool, apple: bool, invite_code_required: bool }  (client renders only enabled buttons)
  POST /auth/google            id_token, invite_code?, invite_token? → tokens   (team contract; 404 when GOOGLE_OAUTH_CLIENT_ID unset;
                                                                   invite_code or a valid invite_token required only when it creates a new user)
  POST /auth/apple             id_token, invite_code?, invite_token? → tokens   (404 when APPLE_SIGNIN_CLIENT_ID / TEAM_ID / KEY_ID / PRIVATE_KEY unset;
                                                                   invite_code or a valid invite_token required only when it creates a new user)
  POST /auth/refresh           refresh_token → tokens   (rotates)
  POST /auth/logout            revokes the refresh token
  POST /auth/password/forgot   email
  POST /auth/password/reset    token, password
  GET  /auth/verify/:token

Account
  GET  /me                     user, accounts[], memberships
  POST /accounts               kind, name  (first account made at onboarding)
  GET  /accounts/:id/profiles
  POST /accounts/:id/profiles  name, emoji, photo_id → seeds defaults
  POST /accounts/:id/invites   email, role, profile_ids, relationship_label → sends email
  POST /invites/:token/accept
  DELETE /accounts/:id/members/:user_id   (reassigns their created rows to the caller)
  PATCH /me/pin                pin → stores pin_hash; client also caches a local hash for offline unlock

Sync
  GET  /sync/pull
  POST /sync/push

Media
  POST /media                  multipart image or video → runs the pipeline → { id, url, kind, width, height, bytes }
                               images return synchronously; videos return { id, status: "processing" } and the
                               row flips to ready when ffmpeg finishes
  GET  /media/:id              the bytes from disk (or a 302 to the bucket URL when the s3 driver is on), immutable cache headers

Public
  GET  /share/:token           read-only JSON: profile name/emoji, today's items with completion, chip balance,
                               working-for reward. Nothing else. Rate limited.

Ops
  GET  /health                 { ok, db: "up"|"down", version }

```

Tokens: access JWT 15 minutes, HS256, secret in `.env`. Refresh token 30 days, random 32 bytes, stored as SHA-256 in `sessions`, rotated on every refresh, old one revoked. This is the shape `oauth-login-pattern.md` specifies (`access_token`, `refresh_token`, `token_type`, `expires_in`).

Rate limits (`@fastify/rate-limit`): 10 per 3 minutes on login/register/forgot, 60 per minute on `/share/:token`.

PIN lock: PIN is verified locally against a cached PBKDF2 hash (WebCrypto, 100k iterations) so unlocking works offline. `users.pin_hash` on the server is the source; it syncs down on login. Lock state (which profile) is a device setting, never synced.

Share link: token is 16 random base32 chars. Regenerating replaces it. `profiles.share_token = null` disables sharing.

## 9. Auth and authorization rules

- `admin` on an account: all profiles in the account, can invite, can remove members, can manage everything.
- `member` on an account: only profiles listed in `profile_members`; can read and write those profiles' content; cannot invite or change profile settings.
- Child view (locked profile): can complete items and steps, record an attitude check, view the chip board. Cannot edit anything. Enforced client-side by the locked shell and server-side by a `X-Locked: 1` header that the API uses to reject every write except `schedule_items.completed_at`, `step_completions`, and `attitude_checks`.
- Every sync request is checked against `profile_members` or admin role. Every push mutation's `profile_id` must equal the request's `profile_id`.

## 10. Environment and infrastructure

### Dev on VM 200 (per `shared-dev-vm-best-practices.md`)

Nothing here is to be executed until we have the go-ahead. It records the steps.

1. Code goes in `/home/<you>/chipperly/` until it is a shared repo, then `/opt/shared/repos/chipperly/`. Never under `/opt/shared/projects/`.
2. Ports: pick one in 3000-3099 for the Next dev server and one in 8000-8099 for the API. Check `app-registry.md` and `ss -tlnp` first. Bind `0.0.0.0` only when you need access from outside the VM.
3. Database: ask an admin to run `create-app-db.sh chipperly` on the Proxmox host. It creates DB `chipperly`, roles `chipperly_owner` and `chipperly_user`, and prints two URLs. Put them in `apps/api/.env`, `chmod 600`:
   ```
   DATABASE_URL=postgresql://chipperly_user:...@10.0.0.100:5432/chipperly
   DATABASE_URL_OWNER=postgresql://chipperly_owner:...@10.0.0.100:5432/chipperly
   JWT_SECRET=...
   GOOGLE_OAUTH_CLIENT_ID=...
   GOOGLE_OAUTH_CLIENT_SECRET=...
   # APPLE_SIGNIN_CLIENT_ID= / APPLE_SIGNIN_TEAM_ID= / APPLE_SIGNIN_KEY_ID= / APPLE_SIGNIN_PRIVATE_KEY=   (unset = button hidden)
   # S3_ENDPOINT= / S3_BUCKET= / S3_ACCESS_KEY_ID= / S3_SECRET_ACCESS_KEY= / MEDIA_PUBLIC_BASE=   (unset = local disk, the default)
   RESEND_API_KEY=...            (or whatever mailer the client owns)
   UPLOAD_DIR=/home/<you>/chipperly-uploads
   WEB_DIR=../web/out            (the API serves the static export from here)
   PORT=80xx
   ```
   Migrations run with `DATABASE_URL_OWNER`; the API runs with `DATABASE_URL`.

   The web build reads its own file, `apps/web/.env.production`, inlined at build time. Nothing in it is secret, but it stays out of git with the rest of `.env*` so there is one rule:
   ```
   NEXT_PUBLIC_BASE_PATH=/chipperly
   NEXT_PUBLIC_API_ORIGIN=                      (empty = same origin)
   NEXT_PUBLIC_SITE_ORIGIN=https://demos.linkedtrust.us
   # NEXT_PUBLIC_GSC_VERIFICATION= / NEXT_PUBLIC_GA4_MEASUREMENT_ID= / NEXT_PUBLIC_CLARITY_PROJECT_ID=   (unset = tags not rendered)
   ```
   Changing any of these means rebuilding `apps/web`.
4. Node 20 via nvm. `pnpm`. `ffmpeg` on the VM (`apt install ffmpeg`; check whether it is already there first). No other global installs.
5. Demo, when approved: `tmp-chipperly.service` systemd unit with an expiry date in `Description`; `/etc/nginx/app-proxies/chipperly.conf` with two `location` blocks (`/chipperly/api/` → API port, `/chipperly/` → static build dir or dev server), `X-Forwarded-Proto https` hardcoded; `sudo nginx -t && sudo systemctl reload nginx`; add the row to `app-registry.md` with ports, unit, conf, expiry. Not registered means it gets killed.
6. Uploads on VM 200 are throwaway. Say so in the demo notes.

### Production (when decided, per `app-vm-best-practices.md` and `new-app-checklist.md`)

- Own app VM (500+), slug `chipperly`, 2GB / 2 cores to start, `--onboot 1`, `--balloon 0`.
- `chipperly.service`: `User=deploy`, `WorkingDirectory=/opt/chipperly/apps/api`, `EnvironmentFile=/opt/chipperly/.env`, `ExecStart=/usr/bin/node dist/server.js`, `Restart=always`, `MemoryMax=768M`, `CPUQuota=150%`. The API also serves the static export from `apps/web/out` (`@fastify/static`, `index.html` per directory because of `trailingSlash`) so there is one process. `next build` needs about 1GB RAM for a minute; that is fine on the 2GB VM because it runs from the deploy script, not inside the `MemoryMax` of the service.
- GitHub Actions on push to `main`: SSH as `deploy`, run `scripts/deploy.sh` (`git tag deploy-$(date +%Y%m%d-%H%M%S)`, `git pull`, `pnpm ci`, `pnpm -F shared build && pnpm -F web build && pnpm -F api build`, `pnpm -F api migrate` with the owner URL, `sudo systemctl restart chipperly`). Deploy key read-only on the repo; CI key as a GitHub secret; both tracked in `app-registry.md`.
- `/etc/cron.d/chipperly-health`: `*/5 * * * * deploy curl -sf http://127.0.0.1:<port>/health || systemctl restart chipperly`.
- DNS A record for the app host → `149.51.16.39`; `caddy-domain add <host> 10.0.0.<vm>:<port>`.
- Media: `UPLOAD_DIR=/opt/chipperly/media` on the app VM disk, owned by `deploy`, `chmod 750`. Size the VM disk for it (start 20GB). Add the nightly restic or rclone job for that directory (see 7b). `apt install ffmpeg` on the VM. If Chipperly later wants a bucket, set `S3_*` and the driver switches.
- `harden-vm.sh`: unattended-upgrades, fail2ban, no root service.
- If Chipperly keeps their own hosting instead, the same systemd unit, `.env`, `/health`, and deploy script work on any Ubuntu box.

## 11. Testing

Minimum that fails when the logic breaks, per package:

- `packages/shared`: schema parse round-trip for each table (vitest, one test file).
- `apps/api`: sync convergence test. Two in-memory clients diverge offline (one edits an activity, the other completes an item and earns chips), both push, both pull, assert identical Dexie contents and identical chip balance. Runs against a throwaway Postgres schema. Also `/auth/*` happy paths and the locked-profile write rejection.
- `apps/web`: vitest for the pure modules (`lib/sync/apply`, `lib/timer`, recurrence materialization) with no React involved. One Playwright smoke: sign in, add an activity to today, `context.setOffline(true)`, check it off, reload, still checked, `setOffline(false)`, sync, assert the server has it.

CI runs `tsc --noEmit`, `eslint .`, `next build` (a broken static export fails here, for example a dynamic segment without `generateStaticParams`), then the tests above on every PR. No coverage targets.

## 12. Order of work

No dates. Each phase ends with something a person can click.

0. Skeleton: repo, workspaces, shared schemas, Drizzle migrations with sync triggers, Fastify with `/health`, Next shell with base path and a verified static export (`pnpm -F web build` then `npx serve out` under `/chipperly/`), Dexie schema, empty sync loop that pulls and pushes nothing. CI green.
1. Identity: register, login, Google, Apple (built, hidden until configured), refresh, `/me`, onboarding (kind → profile → seeds), account switcher, PIN set and lock.
2. Sync core: pull/push for `locations`, `activities`, `activity_steps`, `schedule_items`. My Day with add, reorder, optional time, part-of-day grouping, check-off, expandable steps. Recurrence with skips. Chip ledger entries on completion.
3. Rewards and chips: chip board per location driven by the ledger, goal tied to the working-for reward, redeem, manual +/-. Rewards list with `always_available` filter as the choice board. First-then starting empty with `+` on both pickers.
4. Timer (presets, typed duration, image reveal, end sound, local notification), social stories (per profile, pages with photo and text, viewer), attitude chart writing `attitude_checks` with an animation on "good".
5. Care team: invites, member scoping, remove with reassignment. Share link JSON and the public read-only page. Child locked view.
6. PWA polish (icons, install prompt, update prompt, offline banner), SEO head, robots, sitemap, env-gated GSC/GA4/Clarity tags, sound assets wired in. Demo deploy on VM 200 when approved.
7. Only if Chipperly wants store apps: Capacitor projects, deep links, Apple sign-in vars, store builds.

## 13. Out of scope

Billing and plans. Admin CMS. Global admin-authored stories. Push notifications beyond local timer alerts. Reporting or in-app product analytics. Blog and blog CMS. Multi-language. Migrating any Rails data. The `chipperlyapp.com` marketing site (stays on Vercel).

## 14. Open technical questions

These do not block phase 0 or 1.

- Sound assets: we source open-licensed clips or generate them. Two needed first: chip earned, timer finished. Under 100KB each, OGG + MP3.
- Which mail provider. The client has Resend; we need the key or a new account.
- Production media stays on our server disk unless Chipperly asks for a bucket. The SOW tells them this and offers the option.
- Whether store apps happen at all. Decides if phase 7 exists.
- Whether `weekly` recurrence should allow multiple weekdays (the reference allows one, the weekday of creation).
