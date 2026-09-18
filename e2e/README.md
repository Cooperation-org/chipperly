# Chipperly E2E

Playwright tests against the real app: the Next.js static export (`apps/web/out`)
served by the real Fastify API, against a dedicated embedded Postgres database
(`chipperly_e2e`, separate from the dev and unit-test databases).

## Run it

```sh
# from the repo root
pnpm -F @chipperly/web build   # only needed if apps/web/out doesn't exist yet
pnpm e2e                       # all specs, all four projects (phone, tablet, desktop, ipad-webkit)

pnpm e2e --project=phone                       # one project
pnpm e2e --project=phone e2e/specs/auth.spec.ts  # one spec, one project
pnpm e2e --ui                                  # interactive
```

`pnpm e2e` (`playwright test -c e2e/playwright.config.ts`) starts everything it
needs itself: `e2e/server.mjs` (the `webServer` in `playwright.config.ts`)
boots the embedded Postgres, drops and re-migrates the `chipperly_e2e`
database, and starts the API with `TEST_ENDPOINTS=1` on `127.0.0.1:8123`,
serving the static export via `WEB_DIR`. It fails fast with a clear message
if `apps/web/out` is missing.

If the installed browsers don't match this `@playwright/test` version:

```sh
npx playwright install chromium   # phone, tablet, desktop
npx playwright install webkit     # ipad-webkit
```

## What each spec covers

- `auth.spec.ts` — sign in / sign up / onboarding (S1–S5), forgot password,
  an expired verify link, sign out.
- `today.spec.ts` — the Today tab: empty state, adding/checking/undoing an
  item, the item sheet, date nav, creating a new activity from the picker,
  editing a reward from the library, and an offline check-off that syncs
  back once the connection returns.
- `chips.spec.ts` — the chip board, working-for reward, redeem, chip
  history, free-time choices, and First-Then.
- `timer-stories.spec.ts` — the timer (preset, start/pause, full screen,
  the Today pill) and stories (templates, editor, viewer, duplicate).
- `settings.spec.ts` — the settings menu, the activity/reward/location
  libraries, inviting and accepting a care-team member (via
  `GET /api/testing/last-mail`, in a second browser context), the share
  link (in a second browser context), account, sync status, adding a
  second profile.
- `child.spec.ts` — locking the device with a PIN, the child Today screen
  (no tabs, no settings gear, tap-size minimums), the attitude prompt, and
  unlocking (wrong PIN, then correct PIN).
- `a11y-and-layout.spec.ts` — every reachable (caregiver) route: no
  horizontal overflow, one h1 or a titled top bar, every image has alt
  text, every button has a name, a visible focus ring, and the
  TabBar/TabRail split at the 1024px breakpoint.
- `offline-start.spec.ts` — the full offline-first loop: sign up, add an
  item, let it sync, go offline for a fresh reload (not just an in-session
  offline write), confirm the service worker's precache serves the app and
  the item and sync mark survive, check the item off, navigate to `/chips/`
  and back, then reconnect and confirm Sync now catches up.
- `photo-upload.spec.ts` — pick a photo for an activity and for a profile
  avatar (Settings > Edit profile), confirm the tile updates and the row
  shows the image, and that sync completes. Also carries two `test.fail()`
  cases that assert the *correct* behaviour for a confirmed app bug (see
  History) so they stay visibly red without failing the run.

Every spec file runs its tests `serial` against one shared `page` (tokens
live in IndexedDB, not cookies, so `storageState` doesn't carry auth —
each file signs up its own account with a unique email instead). The whole
run is pinned to one Playwright worker (`workers: 1`): all spec files share
one API process, one database, and one global "last sent email" slot
(`GET /api/testing/last-mail`), so running files concurrently would let one
file's email or data race another's.

## Where things land

- `e2e/screenshots/<project>/<name>.png` — one full-page screenshot per
  screen visited, per project (phone/tablet/desktop).
- `e2e/report/` — the HTML report (`npx playwright show-report e2e/report`).
- `e2e/test-results/` — traces/screenshots Playwright captures on failure.
- `e2e/.uploads/` — the API's `UPLOAD_DIR` for this run (media uploads).

All four are gitignored.

## ipad-webkit notes

Two things about this Playwright WebKit build (not the app — repro'd with
plain pages, no Chipperly code involved) currently make full offline/photo
coverage impossible on this project, so the affected tests use
`test.skip(({ browserName }) => browserName === 'webkit', '<reason>')`:

- **Navigating while offline throws.** `page.reload()`, `page.goto()` and
  `page.waitForURL()` all throw `"WebKit encountered an internal error"`
  once `context.setOffline(true)` is active — confirmed against
  `example.com` with no service worker at all. `offline-start.spec.ts`
  skips only the specific assertions that need a real navigation (the
  reload-survives-offline check, and the offline `/chips/` round trip);
  everything else in that spec (going offline, checking an item off,
  reconnecting) still runs and passes on webkit.
- **Storing a Blob in IndexedDB throws.** `Dexie.put()`-ing a `Blob` (what
  `pickAndStoreImage` in `lib/data/media.ts` does for every photo pick)
  throws `"UnknownError: Error preparing Blob/File data to be stored in
  object store"` every time, for both the activity and the avatar photo
  flow. `photo-upload.spec.ts` skips entirely on webkit for this reason.
  Real Safari has supported Blobs in IndexedDB for years, so this reads as
  a defect in this specific WebKit build/version, not a Chipperly bug.

## History

The first full run of this suite found four app bugs through the UI (invite accept rejected on an empty JSON body, PIN hashes that differed between server and client, sync pushes rejected as stale right after a row was created, and a first pull that ran before the new profile existed). All four are fixed with regression tests; the flows are ordinary passing tests now.

`photo-upload.spec.ts` found a fifth: `POST /media`
(`apps/api/src/routes/media.ts`) ignores the client's `media_id` multipart
field and mints its own `randomUUID()` for the stored row, and
`uploadPending()` (`apps/web/lib/media/upload.ts`) never reads the response
body to learn that id. So the id a synced record actually references
(`photo_id` / `avatar_photo_id`, assigned client-side before the upload
even starts) never matches any media row the server holds — confirmed by
intercepting the `POST /media` response, which 201s with a fresh id nothing
ever reconciles back onto the row. `GET /api/media/<photo_id>` 404s
forever, for every client that doesn't already hold the original local
blob (any other caregiver device, or this one after its IndexedDB cache is
cleared). Not fixed yet: the two `photo-upload.spec.ts` tests that assert
the correct behaviour are marked `test.fail()` so they document this
without failing the run.

## The one API route this suite owns

`apps/api/src/routes/testing.ts` (`GET /testing/last-mail`, returning
`getLastMailMessage()` from `lib/mailer.ts`) is registered in `app.ts` only
when `TEST_ENDPOINTS=1`, which is never set outside this harness. It's how
specs read an invite or password-reset link without a real inbox.
