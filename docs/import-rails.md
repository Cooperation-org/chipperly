# Importing from the Rails beta

A one-off CLI (`apps/api/src/import/**`, entry point
`apps/api/scripts/import-rails.ts`) that copies accounts, profiles and
their content out of the old Rails database (its
`db/schema.rb` is committed as `docs/reference/rails-schema.rb`, with
notes on the app in `docs/reference/rails-app-analysis.md`) and into ours. It is only needed if
real families were using the beta before it's retired; otherwise nothing
in the app depends on it.

## Running it

```sh
cd apps/api
pnpm import:rails --source postgres://user:pass@host/rails_db_name
```

Flags:

- `--dry-run` — runs the whole import inside one transaction per account
  and rolls it back at the end. Prints the same per-table counts you'd get
  from a real run, but nothing is written.
- `--only-account <rails_account_id>` — imports a single Rails account
  (its numeric id), for testing the mapping against one family before
  running it for everyone.
- `--send-reset-emails` — after a real (non-dry-run) import, sends every
  imported user a "set your password" email (the same link shape as
  `/auth/password/forgot`). Off by default so you can inspect the import
  before anyone gets an email.
- `--rails-storage-dir <path>` — carries over photos and story-page images
  from a Rails `Disk` service, reading files at
  `<path>/<blob key[0,2]>/<blob key[2,4]>/<blob key>`, same as Rails itself.
- `--rails-s3-endpoint <url> --rails-s3-bucket <name> --rails-s3-access-key <key> --rails-s3-secret <secret> [--rails-s3-region <region>]` —
  the same, from a Rails `S3` service (DigitalOcean Spaces, Cloudflare R2,
  or anything else S3-compatible); all four of the first flags are required
  together. `--rails-s3-region` defaults to `auto`, which R2 and most
  S3-compatible services accept regardless of where the bucket lives.
  Give either this group or `--rails-storage-dir`, not both.

Leave out every `--rails-storage-dir`/`--rails-s3-*` flag and the import
still runs exactly as before, just without photos: every attachment is
counted (`media: N attachment(s) found, skipped (no storage source given)`
in the run's notes) but never downloaded.

The target database is whatever `DATABASE_URL` in `apps/api/.env` points
at, same as every other API command.

Every write is an **upsert keyed on a deterministic id** (uuid v5, derived
from `rails:<table>:<rails id>`, see `apps/api/src/import/ids.ts`). Running
the command again — against the same or an updated Rails database — updates
the same rows instead of duplicating them, so it's safe to re-run as more
beta users show up, or to fix a mapping and run it again.

## What maps to what

| Rails | Ours | Notes |
| --- | --- | --- |
| `users` | `users` | Email lowercased. `password_hash` and `pin_hash` are left `null` (Rails' bcrypt hash can't be verified by us) **and are never overwritten on a re-import**, so re-running the importer after someone has set a real password doesn't wipe it. `auth_provider` is set to `'rails_import'` — a value outside the `'google' \| 'apple'` union the target schema types that column with, written with one raw SQL insert for just that reason (see the comment in `importRails.ts`); Postgres itself has no check on it. `display_name` is `"first last"`, or the email if neither name is set. `email_verified_at` carries over if Rails had it, else "now". |
| `accounts` + `account_memberships` | `accounts` + `account_members` | `account_type` (0/1/2 = individual/household/organization, confirmed against `app/models/account.rb`) maps to `individual`/`household`/`agency`; unrecognized values default to `household`. Rails has no account "name" column, so one is made up: `"<first profile's name>'s Household"` (or Account/Agency), or `"Imported <kind> <id>"` if the account has no profiles. `role` 0 (admin) → `admin`, anything else (`care_team_member`) → `member`. |
| `profile_assignments` | `profile_members` | Straight copy (`relationship_label` included). |
| `profiles` | `profiles` | `emoji` → `avatar_emoji`. `share_token` is always regenerated as `null` (a new one is issued the first time the caregiver opens Settings). `first_then_activity_id`/`first_then_reward_id` are set from `first_then_state` **only** when that activity/reward was actually imported for the profile; otherwise left `null`. `avatar_photo_id` comes from the profile's `:photo` attachment — see "Photos and videos" below. |
| distinct location strings across `activities.location`, `rewards.location`, and `token_board_state` keys | `locations` | Rails has no `locations` table — a location is just a string. Every distinct name becomes a row, first-seen order. Every imported location keeps the 🏠 default emoji regardless of a photo (there's no emoji column on `location_photos` either way). `chip_goal` and `working_for_reward_id` come from `token_board_state[name]` when present. `photo_id` comes from the matching `location_photos` row's `:photo` attachment, when Rails has one for that name — see below. |
| `token_board_state[name].earned` | one `chip_ledger` row per location, `reason: 'adjust'` | Rails only keeps a current balance, not a history, so the importer credits the whole balance as a single adjustment rather than inventing a fake event-by-event history. |
| `activities` | `activities` | `chip_value` defaults to 0 if null. `recurrence` is one of Rails' own four values, copied as-is. `recurrence_weekday` is only set for `weekly`, taken from the activity's `created_at` weekday (Rails' own rule: `recurs_on?` uses `created_at.wday`). `recurrence_time` (a Rails "time on a dummy date" column) becomes an `HH:MM` string. `skipped_dates` → `recurrence_skips`. |
| `routines` + `routine_steps` | `activities` (with `activity_steps`) | Per SOW choice 2: a routine becomes an activity, its steps become `activity_steps` rows. Each step's `name`/`emoji` is copied from the Rails activity it referenced at import time (a snapshot, same as the Rails UI showed); a step whose activity no longer exists is skipped and noted. Activities and routines share one position sequence per profile, ordered by `created_at`. `skipped_dates` on the routine → `recurrence_skips` against the routine's new activity id. |
| `events` | `schedule_items` | `activity_id` is the imported activity's id, or the routine's activity id — never both (Rails enforces "exactly one of activity or routine", same as our model). Rails has no column distinguishing a hand-added event from one its recurrence generator materialized; every imported event becomes `source: 'manual'`. Recurring activities/routines will materialize their own future occurrences normally once imported — only the past/current events that already existed in Rails are copied over. `completed_by` isn't tracked in Rails, so a completed event is attributed to the account's first admin. |
| `routine_step_completions` | `step_completions` | `completed_at` is the completion row's own `created_at` (Rails only records that it happened, not by whom); `completed_by` is the account's first admin, same reasoning as above. |
| `rewards` (with a `profile_id`) | `rewards`, `always_available: false` | A reward with no `profile_id` in Rails can't be attached to anyone; it's skipped and counted in the run's notes rather than silently dropped. `photo_id` comes from the reward's own `:photo` attachment. |
| `choice_options` | `rewards`, `always_available: true`, `chip_cost: null` | Per SOW choice 1 — Rewards & Choices is already one list in the rebuild. Rewards and choice options share one position sequence per profile. `photo_id` comes from the choice option's own `:photo` attachment. |
| `social_stories` + `social_story_pages` | `social_stories` + `story_pages`, one copy per profile | Rails stories are global and admin-authored, shared by every family; ours are per-profile, so each imported profile gets its own copy (a stable id keyed on `(profile, story)`, so re-imports don't duplicate it). The Rails column is `caption`, not `text`. `story_pages.photo_id` comes from each page's `:image` attachment; `social_stories.cover_photo_id` is always taken from the first page's photo (Rails' `SocialStory` has no `:photo` of its own, only `:video` — see below). |
| pending `invites` (`accepted_at is null`, not archived, not expired) | `invites` | A Rails invite token can't be carried over — it's never stored in our database, only its hash is (same as ours). Every pending invite gets a freshly generated token; the CLI prints the new `/invite/?token=...` link so the caregiver can resend it. Rails invite role `admin` (0) maps to `admin`; `tester`/`user`/`care_team_member` all map to `member` (only `admin`/`care_team_member` invites carry an `account_id` in Rails to begin with). Already-accepted or archived invites are left alone — those people already have accounts, imported the normal way through `account_memberships`. |

## Photos and videos

Given `--rails-storage-dir` or the `--rails-s3-*` flags, the importer carries over every
Rails Active Storage attachment that has somewhere to go in our model: activity, reward,
choice-option, location and profile-avatar photos, and social-story-page images. For each
one it fetches the blob, runs it through the normal pipeline (`processImage` → WebP), stores
it with the app's own configured storage driver (`STORAGE_DRIVER`/`UPLOAD_DIR` or
`S3_*` — a separate setting from where it's *read* from in Rails), and inserts a `media` row
keyed on `rails:active_storage_blobs:<blob id>` (so re-running the importer re-points the
same `*_photo_id` instead of re-fetching or duplicating the row). A missing file, an
unreadable blob, or a pipeline failure is logged, counted under `media_skipped`, and never
aborts the account's import — the row it would have decorated is still imported, just
without a photo.

`SocialStory` itself only has a `:video` attachment in Rails (`has_one_attached :video`),
and there's no column in our model to put a story video in — `social_stories.cover_photo_id`
is a photo, and it always comes from the story's first page instead (see the mapping table
above). Every story video attachment is therefore counted under `media_skipped` and noted by
name, regardless of whether a storage source was given.

Leave out both storage flags and nothing is fetched at all: every attachment that would
otherwise have been carried is still counted, and the run's notes get one summary line
(`media: N attachment(s) found, skipped (no storage source given)`) instead of `photo_id`
staying unset silently.

`--dry-run` never downloads or writes a file, storage source or not — it reports the same
counts a real run would, same as every other table.

## What's not carried

- **Passwords.** Rails hashes them with bcrypt; we can't verify a bcrypt hash without the plaintext, so every imported user needs a password reset (`--send-reset-emails`, or point them at "forgot password" yourself).
- **Social story videos** (Rails `social_stories.video`) — see "Photos and videos" above; there's no place to put one in our model, storage source or not.
- **Stripe / billing** (`plans`, `stripe_customer_id`, `subscriber`, …). Not in scope for the rebuild at all (see `chipperly-sow.md`).
- **`admin_defaults`, `site_settings`, `sessions`.** Server-side/admin configuration, not family data.
- **Already-accepted or archived invites**, and **expired pending invites** (skipped with a note).

## Notes and assumptions worth knowing about

- `accounts.account_type` → kind, and `account_memberships.role` → admin/member, were confirmed against `app/models/account.rb` and `app/models/account_membership.rb` in the reference repo (the enum order isn't visible in `db/schema.rb` alone).
- The importer never enforces the per-account-kind profile limit (`individual` 1 / `household` 8 / `agency` unlimited) — it moves over whatever existed in Rails, limit or no limit. That's a business decision for a human, not something a migration tool should silently truncate.
- The run's console output includes any freshly generated invite links in plain text (so the operator can act on them) — treat that output the same as you would a password-reset email, and don't paste it somewhere public.

## Testing it

`apps/api/test/import-rails.test.ts` loads `apps/api/test/fixtures/rails-schema.sql` — a small, hand-written Rails-shaped schema with a handful of rows covering every mapping above, including `active_storage_attachments`/`_blobs` rows for an activity photo, a profile photo, a story page image and a story video — into its own database (`rails_fixture`) on the same embedded Postgres server the rest of the test suite uses, imports it into `chipperly_test` with `--rails-storage-dir` pointed at `apps/api/test/fixtures/rails-storage` (a tiny committed PNG at the Disk-service path each attachment's blob key maps to), and asserts the mapped values, that the media rows are WebP, that the story video is counted as skipped, that a second run doesn't create duplicate media, and that `--dry-run` writes no files.
