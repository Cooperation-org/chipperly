# Build contracts

Read this before writing any code. `docs/technical-plan.md` says what the system is, `docs/ux-plan.md` says what every screen is, `docs/brand.md` gives colors and fonts. This file fixes the names and shapes that more than one person builds against so the pieces fit when they meet. If this file and another doc disagree, this file wins.

## Ground rules for every agent

- Node 22, pnpm, TypeScript `strict` everywhere. No `any`, no `@ts-ignore`, no non-null `!` except in tests.
- Do not run `pnpm add`, `pnpm install`, or edit any `package.json` dependency list. All dependencies are installed up front. If something is missing, put it in your report under `missingDeps` and code against it as if present.
- Do not run any `git` command. The orchestrator commits.
- Write only inside the paths you own (your prompt names them). If you must touch a shared file, say so in your report with the exact change.
- Comments only where the code cannot say it. Match the surrounding style.
- No barrel `index.ts` files. Import from the file.
- Web: CSS Modules (`X.module.css`) next to the component, design tokens only (no hard-coded colors, sizes on the 8px grid via tokens). `'use client'` on feature components and hooks, never on `page.tsx` or `layout.tsx` unless the whole route is client-only (child mode is).
- Every interactive element: 48x48 minimum hit area (64 in child mode), visible label or `aria-label`, keyboard reachable, visible focus ring.
- Definition of done: your package's `pnpm typecheck` passes (once `node_modules` exists), you smoke-ran what can be run, and your report lists every file you wrote.

## Packages

```text
chipperly/
  package.json            pnpm workspace root; scripts: typecheck, lint, test, build, e2e
  pnpm-workspace.yaml     apps/*, packages/*
  packages/shared/        @chipperly/shared   zod schemas, TS types, constants, pure helpers
  apps/api/               @chipperly/api      Fastify 5 + Drizzle + postgres.js
  apps/web/               @chipperly/web      Next.js App Router, output: 'export'
  e2e/                    Playwright tests (root devDependency @playwright/test)
  docs/                   this file, technical-plan.md, ux-plan.md, brand.md
  scripts/deploy.sh       for later; not run here
  .github/workflows/ci.yml
```

All three packages are ESM (`"type": "module"`). `@chipperly/shared` is built with `tsc` to `packages/shared/dist` (JS + d.ts) and consumed from there by deep path, no barrels: `import { ActivitySchema } from '@chipperly/shared/schemas/activity'`. Its `package.json` has `"exports": { "./*": { "types": "./dist/*.d.ts", "default": "./dist/*.js" } }`. Run `pnpm -F @chipperly/shared build` before typechecking anything else; the root `typecheck`, `test` and `build` scripts do this first.

`tsconfig` in shared and api: `module: NodeNext`, `moduleResolution: NodeNext`, `strict`, `verbatimModuleSyntax`. Because of NodeNext, every relative import in shared and api ends in `.js` (`import { env } from './env.js'` for the file `env.ts`). Web uses `moduleResolution: bundler` and the alias `@/*` -> `./*` (apps/web root); relative imports there have no extension.

## Environment variables

API (`apps/api/.env`, loaded with `node --env-file`; `.env.example` is committed):

```text
DATABASE_URL               postgres://... runtime role
DATABASE_URL_OWNER         postgres://... migrations (defaults to DATABASE_URL when unset)
PORT                       default 8080
HOST                       default 127.0.0.1
JWT_SECRET                 >= 32 chars
WEB_DIR                    path to the Next export to serve; unset = API only
BASE_PATH                  default "" ; e.g. /chipperly ; API mounts under `${BASE_PATH}/api`
CORS_ORIGIN                default unset (same-origin only); dev: http://localhost:3000
UPLOAD_DIR                 default ./uploads
STORAGE_DRIVER             local | s3 (default local)
S3_ENDPOINT S3_BUCKET S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY MEDIA_PUBLIC_BASE
GOOGLE_OAUTH_CLIENT_ID     unset = /auth/google 404 and providers.google=false
APPLE_SIGNIN_CLIENT_ID APPLE_SIGNIN_TEAM_ID APPLE_SIGNIN_KEY_ID APPLE_SIGNIN_PRIVATE_KEY   all set or apple=false
BETA_INVITE_CODE           unset = registration is open. Set = /auth/register requires a matching invite_code
                            (a valid invite_token bypasses it), /auth/google and /auth/apple require it only
                            when they'd create a new user (same invite_token bypass there too), and
                            providers.invite_code_required=true
RESEND_API_KEY             unset = mail is logged to stdout
MAIL_FROM                  default "Chipperly <no-reply@chipperlyapp.com>"
APP_ORIGIN                 public origin used in emails and share links, e.g. https://demos.linkedtrust.us
LOG_LEVEL                  default info
```

Web (`apps/web/.env.production` or shell, inlined at build):

```text
NEXT_PUBLIC_BASE_PATH        default ""      -> next.config basePath
NEXT_PUBLIC_API_ORIGIN       default ""      -> "" means same origin
NEXT_PUBLIC_SITE_ORIGIN      default http://localhost:3000
NEXT_PUBLIC_GOOGLE_CLIENT_ID unset = Google button hidden (server also reports providers)
NEXT_PUBLIC_APPLE_CLIENT_ID  unset = Apple button hidden (server also reports providers)
NEXT_PUBLIC_GSC_VERIFICATION NEXT_PUBLIC_GA4_MEASUREMENT_ID NEXT_PUBLIC_CLARITY_PROJECT_ID
```

Local dev DB: `pnpm -F @chipperly/api db:start` runs an embedded Postgres (package `embedded-postgres`) on port 54329 with data in `apps/api/.pgdata` (gitignored). `DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54329/chipperly`. Tests use database `chipperly_test` on the same server.

## Shared package: `packages/shared/src`

```text
schemas/common.ts        uuid, isoDate (YYYY-MM-DD), hhmm time, SyncColumnsSchema
schemas/account.ts       AccountSchema, AccountKind, UserPublicSchema, MembershipSchema, InviteSchema
schemas/profile.ts       ProfileSchema, ProfileSettingsSchema
schemas/location.ts      LocationSchema
schemas/activity.ts      ActivitySchema, ActivityStepSchema, RecurrenceSchema, RecurrenceSkipSchema
schemas/schedule.ts      ScheduleItemSchema, StepCompletionSchema, PartOfDay
schemas/reward.ts        RewardSchema
schemas/chips.ts         ChipLedgerSchema, ChipReason
schemas/story.ts         SocialStorySchema, StoryPageSchema
schemas/attitude.ts      AttitudeCheckSchema
schemas/mood.ts           MoodEventSchema (Chipper Chart; append-only)
schemas/media.ts         MediaSchema, MediaUploadResponseSchema
schemas/auth.ts          RegisterBody, LoginBody, TokensResponse, ProvidersResponse, MeResponse, ExportResponse, PinBody, ...
schemas/sync.ts          SYNCED_TABLES, APPEND_ONLY_TABLES, SyncPullResponseSchema, SyncPushRequestSchema, SyncPushResponseSchema, MutationSchema
schemas/share.ts         ShareViewSchema
constants/emoji.ts       EMOJI_CHOICES (96 friendly emoji for the picker), AVATAR_EMOJI (24)
constants/limits.ts      PROFILE_LIMITS { individual: 1, household: 8, agency: Infinity }, CHIP_MAX 10, COST_MAX 20
constants/tables.ts      table name literal union `SyncedTable`
helpers/recurrence.ts    occursOn(activity, isoDate, skips): boolean ; materializedId(activityId, isoDate): uuid (v5 namespace UUID fixed here)
helpers/chips.ts         balanceFor(ledger, locationId | null): number
helpers/date.ts          todayIso(now?), addDays(iso, n), weekday(iso) 0-6, isWeekend(iso), formatDayLabel
```

Field names are `snake_case` in every schema, every API payload, every Dexie row and every Postgres column. No camelCase mapping anywhere. Timestamps that sync are `bigint` epoch ms serialized as JS `number` in JSON (`client_updated_at`, `created_at` on ledger rows use ms numbers). `deleted_at` is ms number or null. Dates are `YYYY-MM-DD` strings. Times are `HH:MM` strings.

Sync columns (on every synced table): `id, profile_id, version, client_updated_at, updated_by, deleted_at`. `version` is `number` (server-assigned, 0 on unsynced local rows). `updated_by` is also server-assigned on every push, overwritten with the authenticated user's id regardless of what the client sends.

SYNCED_TABLES, in dependency order (parents first):
`locations, activities, activity_steps, recurrence_skips, rewards, schedule_items, step_completions, chip_ledger, social_stories, story_pages, attitude_checks, mood_events`.
Plus `profiles` is synced read-only through pull (profile row edits go through pull too; `first_then_activity_id`, `first_then_reward_id`, `name`, `avatar_*`, `settings` are pushed as an upsert on table `profiles`). APPEND_ONLY_TABLES: `recurrence_skips, step_completions, chip_ledger, attitude_checks, mood_events`.

Child tables carry `profile_id` too (denormalized) so pull can filter by profile with one index: `activity_steps.profile_id`, `story_pages.profile_id`, `step_completions.profile_id`, `recurrence_skips.profile_id`.

Mutation: `{ table: SyncedTable, id, op: 'upsert' | 'delete', row: object, client_updated_at: number }`. For `delete`, `row` may be omitted; server sets `deleted_at`.

Pull response: `{ changes: Record<SyncedTable | 'profiles', Row[]>, version: number, has_more: boolean }`. Push response: `{ applied: string[], rejected: { id, table, reason, server_row }[], version: number }`.

Tokens response (team contract): `{ access_token, refresh_token, token_type: 'Bearer', expires_in: 900 }`. `MeResponse`: `{ user: UserPublic, accounts: { account: Account, role: 'admin'|'member' }[], profiles: Profile[] }` where profiles are every profile the user can see across accounts. `UserPublic` includes `pin_hash` (client-verifiable, see PIN).

PIN: hashed as `pbkdf2$100000$<salt b64url>$<hash b64url>` with PBKDF2-SHA256, 32-byte output, on both server (Node `crypto.pbkdf2`) and client (WebCrypto). `helpers/pin.ts` in shared exports `formatPinHash(salt, hash, iterations)` and `parsePinHash(str)` only (no crypto in shared).

Consent (SOW Q21 / COPPA): `RegisterBody.consented_at` (ms) is required on every `/auth/register`; `users.consented_at` stores it, nullable for accounts that predate this column. `/auth/google` and `/auth/apple` only require `consented_at` when the sign-in creates a new user; missing it there is a `409 consent_required`, which the web client answers by showing the same consent checkbox inline and retrying with the credential it already has. `ExportResponse` (`GET /me/export`) is everything the signed-in user can see: their own row (no hashes), accounts, memberships, profiles, every synced table row for those profiles (tombstones excluded), and media ids/urls.

## API: `apps/api/src`

```text
server.ts              entry: build app, listen
app.ts                 buildApp({ env }) -> Fastify instance (used by tests)
env.ts                 zod-validated process.env -> Env
db/client.ts           postgres.js + drizzle instance; `db`, `sql`
db/schema/*.ts         Drizzle tables, one file per domain, same names as shared
db/migrate.ts          runs drizzle migrations from db/migrations (drizzle-kit generated + 0001_sync_triggers.sql hand-written)
db/migrations/
plugins/auth.ts        request.user, request.accountId (from X-Account-Id, membership checked), request.locked (server session's locked_profile_id, set/cleared by POST /me/lock and /me/unlock -- never a client header)
plugins/errors.ts      error -> { error: { code, message } } ; zod errors -> 400
routes/health.ts       GET /health
routes/auth.ts         /auth/*
routes/me.ts           GET /me, GET /me/export, PATCH /me/pin, POST /me/lock, POST /me/unlock
routes/accounts.ts     /accounts/*, /invites/:token/accept
routes/sync.ts         /sync/pull, /sync/push
routes/media.ts        /media
routes/share.ts        /share/:token
lib/tokens.ts          jose HS256 access JWT (15 min), refresh token random 32 bytes, sha256 stored
lib/password.ts        scrypt hash/verify (Node crypto), pbkdf2 pin hash/verify
lib/mailer.ts          sendMail({to, subject, text, html}) -> console or Resend via fetch
lib/google.ts          verifyGoogleIdToken(idToken) via jose + Google JWKS
lib/apple.ts           verifyAppleIdToken
media/pipeline.ts      processImage(buffer) -> { buffer, width, height, content_type: 'image/webp' } ; processVideo(inPath, outPath)
media/storage.ts       StorageDriver { put, get, delete, publicUrl? } ; local + s3
media/queue.ts         p-queue concurrency 1 for video
seed/defaults.ts       DEFAULT_ACTIVITIES (30), DEFAULT_REWARDS (18), DEFAULT_LOCATIONS (Home, School), STORY_TEMPLATES (4)
seed/seedProfile.ts    inserts defaults for a new profile
static.ts              serves WEB_DIR under BASE_PATH with SPA-ish fallback: `/x/` -> `/x/index.html`, 404 -> `404.html`
```

Every route validates body/query with the shared zod schema and replies with shared shapes. All routes mount under `${BASE_PATH}/api`. Auth: `Authorization: Bearer <access>`. Account-scoped: `X-Account-Id`. Errors: `{ error: { code: 'invalid_credentials', message } }` with proper status.

Sync authorization: user may read/write profile P if P.account_id is an account where user is `admin`, or user is `member` and (P.id in profile_members for user). A device is child-locked when this session's `sessions.locked_profile_id` is set (POST `/me/lock`; cleared by POST `/me/unlock`, which requires the caregiver's PIN, checked server-side against `users.pin_hash`). While locked, sync/push restricts writes to `schedule_items` (only `completed_at`, `completed_by`, `client_updated_at` may change), `step_completions`, `attitude_checks`, `mood_events`, `chip_ledger` with reason `task|step`.

Push semantics exactly as `docs/technical-plan.md` section 6. One transaction per request. `version` from `sync_version_seq` via trigger `set_sync_version()`.

Tests: vitest, `apps/api/test/*.test.ts`, `test/setup.ts` creates schema in `chipperly_test` (drops and re-migrates once per run), each test file uses its own account. Required: sync convergence test (two clients diverge, both push, both pull, identical state and chip balance), auth happy paths, locked-write rejection, LWW rejection returns server row.

## Web: `apps/web`

### Routes (all static, trailingSlash, no dynamic segments; ids via `?id=`)

```text
(public)
  /                          S1 welcome + sign in
  /sign-up/                  S2
  /forgot-password/          request reset
  /reset-password/?token=    set new password
  /verify/?token=            email verification landing
  /invite/?token=            S33 accept invite
  /share/?token=             S34 viewer (noindex)
  /privacy/                  privacy policy, draft copy (SOW Q21)
  /terms/                    terms, draft copy (SOW Q21)
(onboarding)                 requires session
  /onboarding/kind/          S3
  /onboarding/profile/       S4
  /onboarding/ready/         S5
(caregiver)                  requires session + active profile; TopBar + TabBar/TabRail
  /today/                    S6 (+ S7 item sheet, S8 picker sheet)
  /activity/edit/?id=        S9 (no id = create)
  /reward/edit/?id=          S19
  /chips/                    S10 (+ S11 sheet)
  /chips/history/            S12
  /timer/                    S13 (+ S14 overlay)
  /first-then/               S15
  /stories/                  S16 (+ S17 overlay)
  /story/edit/?id=           S18
  /settings/                 S20 (+ S23 lock, S28 share, S31 sync sheets)
  /settings/profiles/        S21
  /settings/profile/edit/?id=  S22
  /settings/library/activities/  /settings/library/routines/  /settings/library/rewards/  /settings/library/locations/   S25
  /settings/care-team/       S26 (+ S27 sheet)
  /settings/attitude/        S29
  /settings/account/         S30
  /chipper-chart/            S35
(child)                      client-only
  /child/                    S32 (+ S24 pin pad, S11, S14, S17, S35 overlays)
```

Query params are read with `useSearchParams()` inside `<Suspense>`. Navigation with `next/link` and `useRouter`; never hard-coded `${basePath}` in hrefs (Next adds it). Raw `src`/`fetch` URLs go through `withBase()` from `lib/api/base.ts`.

### Layout rules

- Caregiver shell: `TopBar` (avatar + profile name with switcher, title, `SyncMark`, gear) on top; `TabBar` at the bottom below 1024px, `TabRail` on the left at 1024px and up; content single column `max-width: 640px` centered, padding 16, bottom padding clears the tab bar. Five tabs: Today `/today/`, Chips `/chips/`, Timer `/timer/`, First-Then `/first-then/`, Stories `/stories/`.
- Child shell: no tabs, header only, `max-width: 720px`, base font 20px.
- Sheets: one at a time, rendered by `SheetHost` from `components/ui/Sheet.tsx` via `useSheet()`; Back inside a sheet returns to the previous sheet content, never stacks.
- No layout shift: images have fixed boxes; skeleton only on first sync of a newly visible profile.

### Design tokens: `app/styles/tokens.css` (all on `:root`)

```text
--color-primary #1F6F78   --color-primary-ink #FFFFFF
--color-secondary #71A6A6 --color-accent #F7931E
--color-bg #FAF8F5        --color-surface #FFFFFF   --color-surface-2 #F1EDE7
--color-text #3D3D3D      --color-text-muted #6B6B6B  --color-border #DDD6CC
--color-success #2E8B57   --color-danger #B3261E     --color-focus #1F6F78
--font-heading / --font-body    (set by next/font variables, see app/fonts.ts)
--text-sm .875rem  --text-md 1rem  --text-lg 1.25rem  --text-xl 2rem  --text-2xl 3rem
--space-1 4px --space-2 8px --space-3 16px --space-4 24px --space-5 32px --space-6 48px
--radius-sm 8px --radius-md 12px --radius-lg 20px --radius-full 999px
--tap 48px --tap-child 64px --tile-list 48px --tile-grid 96px --tile-child 72px
--shadow-sheet 0 -8px 32px rgba(0,0,0,.12)
--motion-fast 150ms --motion 220ms --ease cubic-bezier(.2,.8,.2,1)
```

Dark mode is out of scope. `prefers-reduced-motion: reduce` and `[data-reduce-motion="true"]` on `<html>` set every `--motion*` to 0ms. `[data-mode="child"]` on `<html>` sets base font 20px and `--tap` to 64px.

### `lib/` exports (names are fixed; other agents import these)

```text
lib/db/db.ts             export const db: ChipperlyDB (Dexie). Tables: every SYNCED_TABLE + profiles, accounts, users(me cache) +
                         outbox {id, table, op, row, client_updated_at, attempts, created_at}
                         kv {key, value}  (device settings, active_profile_id, active_account_id, tokens, lock state, cursors)
                         media_blobs {media_id, blob, uploaded: 0|1}
lib/db/kv.ts             getKv<T>(key), setKv(key, value), useKv<T>(key, fallback)
lib/ids.ts               newId(): uuid v7 ; materializedId (re-export from shared)
lib/clock.ts             now(): ms adjusted by server offset; setServerDate(headerValue)
lib/api/base.ts          basePath, apiBase, withBase(path)
lib/api/client.ts        api.get/post/patch/delete(path, body?, opts?) -> parsed JSON; attaches bearer; on 401 tries refresh once then throws ApiError{status, code}
lib/auth/session.ts      useSession(): { status: 'loading'|'signed_out'|'signed_in', user, accounts, profiles } ;
                         signInWithPassword, signUp, signInWithGoogle(idToken), signOut, refreshMe(), setPin(pin)
lib/auth/RequireSession.tsx  <RequireSession redirectTo="/">{children}</RequireSession>
lib/auth/pin.ts          hashPin(pin) -> string ; verifyPin(pin, hash) -> boolean (WebCrypto PBKDF2)
lib/profile/active.ts    useActiveProfile(): { profile, setActiveProfileId, profiles } ; useActiveAccount()
lib/sync/engine.ts       startSync(), stopSync(), syncNow(), useSyncStatus(): { state: 'synced'|'pending'|'offline'|'error', pending: number, last_synced_at: number|null }
lib/sync/mutate.ts       upsert(table: MutationTable, row) ; softDelete(table, id) ; restore(table, id) ; MutationTable = SyncedTable | "profiles" (from @chipperly/shared/constants/tables) ; each writes Dexie + outbox and returns Promise<void>
lib/data/schedule.ts     useDayItems(profileId, isoDate) -> items with activity + steps + completions joined ; addToDay ; setCompleted(itemId, done, by) ; setStepCompleted ; removeFromDay(itemId, scope: 'today'|'always') ; reorder ; materializeRecurring(profileId, isoDate) ; copyDay(from, to)
lib/data/activities.ts   useActivities(profileId) ; useActivity(id) ; saveActivity(input) ; deleteActivity(id) ; recent
lib/data/rewards.ts      useRewards(profileId, {location_id?, always_available?}) ; saveReward ; deleteReward
lib/data/locations.ts    useLocations(profileId) ; saveLocation ; deleteLocation ; useActiveLocation(profileId) (device kv per profile)
lib/data/chips.ts        useBalance(profileId, locationId) ; addChip(profileId, locationId, reason, ref_id?, delta=1) ; redeem(profileId, locationId, reward) ; useLedger(profileId, locationId?) ; useWorkingFor(profileId, locationId)
lib/data/stories.ts      useStories(profileId) ; useStory(id) ; saveStory ; deleteStory ; duplicateStory ; createFromTemplate(templateKey)
lib/data/attitude.ts     recordAttitude(profileId, itemId, value) ; useAttitudeHistory(profileId)
lib/data/mood.ts         useMoodLevel(profileId, isoDate) ; useMoodHistory(profileId) ; setMood(profileId, isoDate, nextLevel, userId) ; levelEmoji(level) ; dayHistory(events)
lib/data/firstThen.ts    useFirstThen(profileId) ; setFirst ; setThen ; clear ; completeFirst
lib/data/media.ts        pickAndStoreImage(file) -> media_id (client resize, Dexie blob, queued upload) ; useMediaUrl(media_id) -> object URL or remote URL ; uploadPending()
lib/timer/store.ts       useTimer(): { remaining_ms, total_ms, running, reveal_media_id, sound } ; setDuration ; start ; pause ; reset ; setReveal ; (module singleton + useSyncExternalStore; survives route changes)
lib/device/settings.ts   useDeviceSettings(): { sounds, reduce_motion, ... } ; lock state: useLock(): { locked_profile_id, options } ; lockTo(profileId, options) ; unlock()
lib/sound.ts             playChip(), playTimerDone() (respects sounds setting; files in public/sounds/)
lib/toast.tsx            toast(message, { undo?: () => void }) ; <ToastHost/>
```

### UI primitives: `components/ui/*.tsx` (+ `.module.css`)

`Button` (variants primary/secondary/ghost/danger, sizes md/lg), `BigButton`, `IconButton`, `Sheet` + `SheetHost` + `useSheet()`, `Toast` (via lib/toast), `CheckCircle` (role=checkbox, sizes md 48 / lg 64), `PictureTile` (emoji | media_id, sizes list/grid/child, alt = name), `ListRow`, `StepRow`, `ChipStrip`, `ChipBoard`, `Stepper`, `Segmented`, `EmptyState`, `Celebration`, `SyncMark`, `TopBar`, `TabBar`, `TabRail`, `TextField`, `Field` (label + control + error), `Confirm` (sheet variant), `Skeleton`, `VisuallyHidden`, `Icon` (single outline set as inline SVG paths: check, plus, minus, chevron, clock, star, lock, gear, sync, camera, image, trash, drag, close, play, pause, arrowLeft, arrowRight, share, users, home, book, timer, split (first-then), chips).

Feature components live under `components/<feature>/` and are owned by the feature agent: `components/picker/Picker.tsx` (props: `{ kind: 'activity'|'reward', profileId, locationId?, title, onPick(item), onCreateNew() }`), `components/picture/PicturePicker.tsx` (props: `{ value: { emoji?: string, photo_id?: string|null }, onChange }`), `components/timer/TimerRing.tsx`, `components/pin/PinPad.tsx`, `components/story/StoryViewer.tsx` (props `{ story, pages, onClose }`), `components/schedule/DateNav.tsx`.

### PWA

`@serwist/next` with `swSrc: app/sw.ts`, `swDest: public/sw.js`, `register: false`; `components/pwa/SwRegister.tsx` registers `${basePath}/sw.js` and shows the update toast. Runtime caching per technical plan 7. `app/manifest.ts` from the Metadata API. Icons in `public/icons/` (192, 512, maskable 512, apple-touch 180) generated from `public/brand/mark.svg`.

### Sounds

`public/sounds/chip.ogg`, `chip.mp3`, `timer-done.ogg`, `timer-done.mp3`. Short, soft, under 100KB.

## Definition of production-ready for this build

- `pnpm typecheck && pnpm lint && pnpm test && pnpm build` green at the root.
- API serves the export; `GET /health` returns `{ ok: true, db: 'up' }`.
- Every screen S1 to S34 exists and matches `docs/ux-plan.md`.
- Playwright E2E green at 390x844, 820x1180, 1440x900: no horizontal overflow, no element outside the viewport that is meant to be visible, every primary action reachable, offline check-off works and syncs back.
- No secret in the repo. `.env.example` documents every var.
