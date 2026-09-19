# Reference repo analysis: dev-mhany/chipperly

Cloned to `e:\Chipperly\reference-lovable` on 17 Sept 2026 (HEAD `3369102`, "Add tentative plan from app feedback doc"). Read-only reference for the rebuild.

## What it actually is

This is not a Lovable export. It is a Ruby on Rails 8.1 app, about 12,000 lines across models, controllers, views, Stimulus JS, and CSS, with 60 migrations dated March to September 2026. It is deployed with Kamal to a single DigitalOcean droplet at chipperlyapp.com and is currently in preview mode (waitlist, signups off).

| | |
| --- | --- |
| Framework | Rails 8.1.2, Ruby 3.4.2 |
| Frontend | Hotwire (Turbo + Stimulus), server-rendered ERB, plain CSS |
| Database | PostgreSQL per `Gemfile` and `database.yml`. README and CLAUDE.md still say SQLite. Mid-migration. |
| Storage | Active Storage (local disk volume) for photos |
| Billing | Stripe (checkout, webhooks, billing portal), `plans` table |
| Email | Resend (invites, verification, password reset) |
| Jobs / cache / cable | Solid Queue, Solid Cache, Solid Cable |
| Tests | 27 test files. Their own notes say tests were not run recently (no test DB). |
| PWA | Manifest exists (placeholder: theme color "red"). Service worker is the empty Rails template. No offline support. |
| API | `/api/v1` JSON API with token auth, partially ahead of the web UI |

## Data model

Two layers: tenancy on the left, per-profile content on the right.

```
User ─┬─ AccountMembership (role: admin | care_team_member) ─ Account (individual | household | organization)
      │                                                          └─ Profile (the child / individual)
      └─ ProfileAssignment (care_team_member sees only these)         ├─ Activity  (name, emoji, photo, frequency, chip_value, location, recurrence)
                                                                      ├─ Routine   (name, emoji, recurrence) ─ RoutineStep (position → Activity)
                                                                      ├─ Event     (scheduled_date, position, start_time?, completed_at, activity XOR routine)
                                                                      │     └─ RoutineStepCompletion
                                                                      ├─ Reward    (name, emoji, photo, chip_cost, location)
                                                                      ├─ ChoiceOption (name, emoji)   ← table only, no UI
                                                                      ├─ LocationPhoto
                                                                      └─ JSON blobs on Profile: locations[], token_board_state{}, first_then_state{}
```

Global (not per profile): `SocialStory` + `SocialStoryPage` (admin-authored, read-only for users), `AdminDefault` (default activity/reward lists), `Plan`, `SiteSetting`, `Invite`, `Session`.

### Semantics worth keeping

- **Event is the unit of "a thing on a day."** An Event points to exactly one Activity or one Routine. Ordering is by `position` within a day; time is optional and does not affect order. Recurring activities/routines are materialized into Event rows lazily on first load of that date (`Profile#generate_recurring_events_for`), with `skipped_dates` to suppress a single occurrence. This is a clean, simple model. Keep it.
- **Recurrence** is a fixed enum: `daily | weekdays | weekends | weekly` (weekly = same weekday as creation). No custom RRULEs. Enough for v1.
- **Token board state is per location**: `{ "Home": { goal, earned, reward_id }, "Dad's": {...} }`. Goal is clamped 1..20. Completing a chip-valued activity credits the board for that activity's location. Reward `chip_cost` exists but is *not* wired to the board goal (their plan item 2).
- **Rewards and activities filter by location** with `where(location: [nil, location])`, so a null location means "everywhere."
- **Share links**: 12-char lowercase alphanumeric `share_token` on Profile, `/s/:token`, read-only, regenerate invalidates.
- **PIN lock**: a second `has_secure_password :lock_password` on User plus a signed cookie `locked_profile_id`. When set, every page resolves to that one profile. Cheap and effective.
- **Account limits**: individual = 1 profile, household = 8, organization = unlimited.
- **Care team**: `Invite` (30-day expiry, token) creates an `AccountMembership` and, for care_team_member, `ProfileAssignment`s. Admins see all profiles; members see assigned ones. `can_manage?` = admin or creator.
- **Default content**: `Profile::DEFAULT_ACTIVITIES` (30 items) and `DEFAULT_REWARDS` (18 items, incl. three screen-time tiers) seed every new profile. Overridable per instance via `AdminDefault`. Reuse the lists.

### Smells to avoid in the rebuild

- Location is a **string** on Activity/Reward/token_board_state, matched by name. Renaming a location orphans everything. Make Location a real entity with an id.
- `User.account_id` legacy column alongside `AccountMembership`. Two sources of truth during a transition.
- `Reward.account_id` and `Reward.profile_id` both optional. Unclear ownership.
- Social stories are global and admin-only. The product wants per-profile, user-authored stories with photos.
- Two enums named `role` with different meanings (`User.role` = site admin/tester/user; `AccountMembership.role` = admin/care_team_member; `Invite.role` = union of both).
- Business logic in controllers (`TokenBoardController#update` is a `case` on `action_type` strings).

## Features: built vs. not

| Feature | Web UI | API | Notes |
| --- | --- | --- | --- |
| My Day schedule (events per date, reorder up/down, optional time) | Yes | Yes | Month/year calendar views via `simple_calendar` |
| Check off an event | No | Yes | `completed_at` exists; no web check-off, no progress bar |
| Recurring activities / routines | No | Yes | Model complete; web has no recurrence picker and doesn't call the generator |
| Routines with steps | No | Yes | Tables + API only. No builder screen, no expandable rows |
| Chip value on activities | No | Yes | Column exists, not in forms |
| Chip board (per location, goal, +/-, pick reward) | Yes | Yes | Goal not tied to reward cost |
| Custom rewards with photo | Yes | Yes | Fixed 16 Sept |
| Locations with photo | Yes | Yes | |
| First-Then | Yes | Yes | Just stores activity_id + reward_id; auto-populates, confusing per feedback |
| Choice board | No | No | Table only |
| Timer | Yes | n/a | Presets only, localStorage persistence, survives reload. No typed duration, no image reveal |
| Social stories | View only | View only | Admin CRUD in `/admin` |
| Chipper attitude chart | No | No | Not in the codebase at all |
| Sound effects | No | No | Not in the codebase |
| Profiles, switching | Yes | Yes | |
| PIN lock (shared device) | Yes | | |
| Share links | Yes | | |
| Care team invites | Yes | Yes | Email "not working yet" per feedback; likely Resend config |
| Onboarding (who / profile) | Yes | | |
| Stripe billing, plans, pricing page | Yes | | You said no pricing. Drop. |
| Admin panel (users, defaults, plans, invites, stories) | Yes | | |
| Offline | No | | Nothing. Server-rendered, no SW caching |

So: the Chipper chart, sounds, and image-reveal timer that appear in the third demo video are **not** in this repo. Either the video was a different build or those were never merged.

## Their own backlog (PLAN-9-16.md, from the client's feedback doc)

Highest weight: My Day. The rest in their order.

1. My Day: part-of-day grouping (morning/afternoon/evening), starter templates for an empty day, recurrence in the web UI, routine builder + expandable routine rows, chip value on forms, web check-off with progress bar, paste/camera in photo upload.
2. Chip board: tie board goal to the selected reward's `chip_cost`; verify location switching with two locations.
3. Choice board: needs photo + location + a screen. Possibly merge with rewards ("always available" vs. "costs chips").
4. First-Then: start empty, add `+` to pickers.
5. Social stories: decide "coming soon" vs. a user-facing editor.
6. Timer: typed duration, photo reveal. Deferred.
7. Reward library: merge with choice board? Open.
8. Dashboard: profile switcher, "Coming soon" badges, star icon for chip board, where the Chipper chart lives, apply brand kit (Drive folder in the doc).
9. Care team: invite email broken.

Open product questions they never closed: where the Chipper chart goes, merging choice board and rewards, social story editor or not, location-based free time with chip gating.

## What this means for the rebuild

Your constraints: from scratch, runs everywhere, offline-first, customizable, no billing, backend TBD.

Take from this repo:
- The Event / Activity / Routine / RoutineStep model and the lazy-materialize recurrence pattern.
- Per-location token board state shape, clamping rules, and chip crediting on completion.
- Share token + PIN lock designs. Both are small and solve real needs.
- Account types and profile limits (individual 1, household 8, org unlimited).
- Default activity and reward lists.
- The tenancy shape (Account, Membership, Profile, Assignment). It's right for household + agency.
- The feedback backlog above as the v1 scope, since it's the client's actual asks.

Leave behind:
- Rails/Hotwire server rendering. Offline-first needs a client that owns its data. This app has zero offline story.
- Stripe, plans, pricing page, subscriber enum.
- String-keyed locations.
- Global admin-authored social stories.
- Admin panel as built (defaults can live in seed data or a settings screen).

Not decided yet and needs a call before modeling: whether "reward" and "choice" are one entity with an `always_available` flag, and whether a routine's steps are Activities (as here) or free-text steps. Both affect the schema.

## Files worth opening

- `db/schema.rb`: full schema.
- `app/models/profile.rb`: defaults, recurrence materialization, chip crediting.
- `app/models/event.rb`: ordering, move, XOR validation.
- `app/models/concerns/recurring.rb`: the four recurrence rules.
- `app/controllers/token_board_controller.rb`: board state transitions.
- `app/controllers/concerns/authentication.rb` and `authorization.rb`: PIN lock and access rules.
- `app/models/invite.rb`: care team invite lifecycle.
- `app/javascript/controllers/timer_state.js`: timer persistence, a decent pattern for local state.
- `PLAN-9-16.md`, `NOTES-9-16.md`: the client feedback and what was done about it.
- `documentation/admin-guide.md`, `support-guide.md`, `home_page_copy.md`.
