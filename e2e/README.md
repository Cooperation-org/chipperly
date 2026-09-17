# Chipperly E2E

Playwright tests against the real app: the Next.js static export (`apps/web/out`)
served by the real Fastify API, against a dedicated embedded Postgres database
(`chipperly_e2e`, separate from the dev and unit-test databases).

## Run it

```sh
# from the repo root
pnpm -F @chipperly/web build   # only needed if apps/web/out doesn't exist yet
pnpm e2e                       # all specs, all three projects (phone, tablet, desktop)

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

If the installed Chromium doesn't match this `@playwright/test` version:

```sh
npx playwright install chromium
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

## Known app bugs this suite documents (not fixed here)

Four specs contain a test marked `test.fail(true, '...')`: the flow up to
the bug is exercised for real, the test is expected to fail at the known
broken step, and the comment right above it names the root cause and the
files involved. If one of these ever starts passing unexpectedly, Playwright
flags it (`test.fail()` inverts pass/fail), which is the signal the bug got
fixed.

- `settings.spec.ts` "S26/S27 care team": accepting an invite 400s.
  `lib/api/client.ts` always sends `Content-Type: application/json` even on
  a body-less request; Fastify rejects that combination. Same pattern
  likely breaks resend/cancel invite, remove member and delete account.
- `settings.spec.ts` "S28 share link": enabling the toggle 404s when
  fetched back. The push that carries `profiles.share_token` to the server
  can be rejected as stale (or 500) because of clock-skew in
  `lib/clock.ts`'s second-resolution offset, shortly after profile
  creation.
- `child.spec.ts` "S24 lock glyph": unlocking with the correct PIN always
  fails. The server (`apps/api/src/lib/password.ts`) and the client
  (`apps/web/lib/auth/pin.ts`) hash the PIN with different interpretations
  of the same salt string, so a PIN set through the server never verifies
  on the client.

`helpers.ts`'s `signUp()` also works around a fourth, non-fatal one: a
fresh profile's seeded activities/rewards/locations can take up to 60s to
reach the client (`lib/sync/engine.ts`'s first sync cycle can race ahead of
the profile's own creation), so it forces a sync and waits for the actual
data rather than trusting the sync status label.

## The one API route this suite owns

`apps/api/src/routes/testing.ts` (`GET /testing/last-mail`, returning
`getLastMailMessage()` from `lib/mailer.ts`) is registered in `app.ts` only
when `TEST_ENDPOINTS=1`, which is never set outside this harness. It's how
specs read an invite or password-reset link without a real inbox.
