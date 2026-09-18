# Importing from the Rails beta

A one-off CLI (`apps/api/src/import/**`, entry point
`apps/api/scripts/import-rails.ts`) that copies accounts, profiles and
their content out of the old Rails database (see
`E:\Chipperly\reference-lovable\db\schema.rb` and
`E:\Chipperly\reference-analysis.md`) and into ours. It is only needed if
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
| `profiles` | `profiles` | `emoji` → `avatar_emoji`. `share_token` is always regenerated as `null` (a new one is issued the first time the caregiver opens Settings). `first_then_activity_id`/`first_then_reward_id` are set from `first_then_state` **only** when that activity/reward was actually imported for the profile; otherwise left `null`. |
| distinct location strings across `activities.location`, `rewards.location`, and `token_board_state` keys | `locations` | Rails has no `locations` table — a location is just a string. Every distinct name becomes a row, first-seen order. `location_photos` only tells us a photo existed, never an emoji (there's no emoji column on that table and photos are out of scope — see below), so every imported location gets the 🏠 default. `chip_goal` and `working_for_reward_id` come from `token_board_state[name]` when present. |
| `token_board_state[name].earned` | one `chip_ledger` row per location, `reason: 'adjust'` | Rails only keeps a current balance, not a history, so the importer credits the whole balance as a single adjustment rather than inventing a fake event-by-event history. |
| `activities` | `activities` | `chip_value` defaults to 0 if null. `recurrence` is one of Rails' own four values, copied as-is. `recurrence_weekday` is only set for `weekly`, taken from the activity's `created_at` weekday (Rails' own rule: `recurs_on?` uses `created_at.wday`). `recurrence_time` (a Rails "time on a dummy date" column) becomes an `HH:MM` string. `skipped_dates` → `recurrence_skips`. |
| `routines` + `routine_steps` | `activities` (with `activity_steps`) | Per SOW choice 2: a routine becomes an activity, its steps become `activity_steps` rows. Each step's `name`/`emoji` is copied from the Rails activity it referenced at import time (a snapshot, same as the Rails UI showed); a step whose activity no longer exists is skipped and noted. Activities and routines share one position sequence per profile, ordered by `created_at`. `skipped_dates` on the routine → `recurrence_skips` against the routine's new activity id. |
| `events` | `schedule_items` | `activity_id` is the imported activity's id, or the routine's activity id — never both (Rails enforces "exactly one of activity or routine", same as our model). Rails has no column distinguishing a hand-added event from one its recurrence generator materialized; every imported event becomes `source: 'manual'`. Recurring activities/routines will materialize their own future occurrences normally once imported — only the past/current events that already existed in Rails are copied over. `completed_by` isn't tracked in Rails, so a completed event is attributed to the account's first admin. |
| `routine_step_completions` | `step_completions` | `completed_at` is the completion row's own `created_at` (Rails only records that it happened, not by whom); `completed_by` is the account's first admin, same reasoning as above. |
| `rewards` (with a `profile_id`) | `rewards`, `always_available: false` | A reward with no `profile_id` in Rails can't be attached to anyone; it's skipped and counted in the run's notes rather than silently dropped. |
| `choice_options` | `rewards`, `always_available: true`, `chip_cost: null` | Per SOW choice 1 — Rewards & Choices is already one list in the rebuild. Rewards and choice options share one position sequence per profile. |
| `social_stories` + `social_story_pages` | `social_stories` + `story_pages`, one copy per profile | Rails stories are global and admin-authored, shared by every family; ours are per-profile, so each imported profile gets its own copy (a stable id keyed on `(profile, story)`, so re-imports don't duplicate it). The Rails column is `caption`, not `text`. |
| pending `invites` (`accepted_at is null`, not archived, not expired) | `invites` | A Rails invite token can't be carried over — it's never stored in our database, only its hash is (same as ours). Every pending invite gets a freshly generated token; the CLI prints the new `/invite/?token=...` link so the caregiver can resend it. Rails invite role `admin` (0) maps to `admin`; `tester`/`user`/`care_team_member` all map to `member` (only `admin`/`care_team_member` invites carry an `account_id` in Rails to begin with). Already-accepted or archived invites are left alone — those people already have accounts, imported the normal way through `account_memberships`. |

## What's not carried

- **Photos and videos** (Rails Active Storage: activity/reward/location/story photos, social story videos). Out of scope for this importer; every imported row gets `photo_id: null` and keeps its emoji instead. Re-uploading photos is a manual follow-up per family.
- **Passwords.** Rails hashes them with bcrypt; we can't verify a bcrypt hash without the plaintext, so every imported user needs a password reset (`--send-reset-emails`, or point them at "forgot password" yourself).
- **Stripe / billing** (`plans`, `stripe_customer_id`, `subscriber`, …). Not in scope for the rebuild at all (see `chipperly-sow.md`).
- **`admin_defaults`, `site_settings`, `sessions`.** Server-side/admin configuration, not family data.
- **Already-accepted or archived invites**, and **expired pending invites** (skipped with a note).

## Notes and assumptions worth knowing about

- `accounts.account_type` → kind, and `account_memberships.role` → admin/member, were confirmed against `app/models/account.rb` and `app/models/account_membership.rb` in the reference repo (the enum order isn't visible in `db/schema.rb` alone).
- The importer never enforces the per-account-kind profile limit (`individual` 1 / `household` 8 / `agency` unlimited) — it moves over whatever existed in Rails, limit or no limit. That's a business decision for a human, not something a migration tool should silently truncate.
- The run's console output includes any freshly generated invite links in plain text (so the operator can act on them) — treat that output the same as you would a password-reset email, and don't paste it somewhere public.

## Testing it

`apps/api/test/import-rails.test.ts` loads `apps/api/test/fixtures/rails-schema.sql` — a small, hand-written Rails-shaped schema with a handful of rows covering every mapping above — into its own database (`rails_fixture`) on the same embedded Postgres server the rest of the test suite uses, imports it into `chipperly_test`, and asserts the mapped values plus that a second run doesn't create duplicates.
