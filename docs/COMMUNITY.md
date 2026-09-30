# Community contract (#10)

Read `docs/CONTRACTS.md` first; this file only adds the community feature and wins where the two disagree about it. Owner decisions behind it, 30 Sept 2026:

- Backend and database live on **the app server**, not Cloudflare. It reuses the existing auth, Postgres and media pipeline; Cloudflare free usage stays at zero.
- **Signed-in app users post. Reading is public.**
- Shareable: posts, images, comments, social stories and routines. Recordings go too, and **the sharer chooses per item whether the audio is included**.
- **Both** a caregiver and a person's own profile can post: a "child" profile may be a 25-year-old.
- A **community nickname** is chosen once. Never the profile name, never the email. The setup screen says why.
- Moderation is done by **a support role and the existing super admin**.
- Reaching the community from a person's own (locked) view **requires the team PIN**.
- **v1 is free sharing.** Charging for an item needs Stripe Connect and a decision the owner has not made; do not build payouts.

## Not part of the offline sync engine

Community is **online-only**. It is NOT in `SYNCED_TABLES`, NOT in `packages/shared/src/constants/tables.ts`, NOT in Dexie, and it does NOT go through `/sync/push` or `/sync/pull`. It is plain authenticated REST. This is deliberate: a public feed has no offline story, and keeping it out of sync avoids a Dexie migration and the whole last-write-wins problem. When offline, the community screens show the standard offline state and nothing else.

## Tables (migration `0026_community.sql`, written by hand)

Timestamps are `bigint` epoch ms. Ids are uuid v7 generated client-side or by the API.

```text
community_profiles     user_id uuid PK -> users.id
                       nickname citext UNIQUE NOT NULL     -- set once, never the profile name or email
                       created_at bigint NOT NULL

community_posts        id uuid PK
                       author_user_id uuid NOT NULL -> users.id
                       author_profile_id uuid NULL -> profiles.id   -- which person posted, when it is theirs
                       kind text NOT NULL            -- 'post' | 'story' | 'routine'
                       title text NULL
                       body text NULL
                       payload jsonb NULL            -- a SNAPSHOT of the shared story/routine, never a live link
                       include_audio boolean NOT NULL DEFAULT false
                       status text NOT NULL DEFAULT 'published'  -- 'published' | 'hidden' | 'removed'
                       created_at bigint NOT NULL
                       updated_at bigint NOT NULL

community_media        id uuid PK
                       post_id uuid NOT NULL -> community_posts.id ON DELETE CASCADE
                       media_id uuid NOT NULL -> media.id      -- reuse the existing media table, do not invent storage
                       kind text NOT NULL            -- 'image' | 'audio'
                       position int NOT NULL

community_comments     id uuid PK
                       post_id uuid NOT NULL -> community_posts.id ON DELETE CASCADE
                       author_user_id uuid NOT NULL
                       author_profile_id uuid NULL
                       body text NOT NULL
                       status text NOT NULL DEFAULT 'published'
                       created_at bigint NOT NULL

community_reports      id uuid PK
                       target_type text NOT NULL     -- 'post' | 'comment'
                       target_id uuid NOT NULL
                       reporter_user_id uuid NOT NULL
                       reason text NOT NULL           -- see ReportReason below
                       note text NULL
                       status text NOT NULL DEFAULT 'open'   -- 'open' | 'actioned' | 'dismissed'
                       created_at bigint NOT NULL
                       resolved_by uuid NULL -> users.id
                       resolved_at bigint NULL
```

Indexes: `community_posts (status, created_at desc)` for the feed, `community_comments (post_id, created_at)`, `community_reports (status, created_at)`, and the unique nickname.

**A shared story or routine is copied, not linked.** `payload` holds a snapshot so that editing or deleting your own story never changes or breaks what other people already took. Importing a shared item creates new local rows owned by the importer.

## The support role

Moderation is allowed for a user who is either the existing super admin (`SUPER_ADMIN_EMAILS`, `is_super_admin` in `schemas/account.ts`) **or** carries the new support flag.

`users.is_support boolean NOT NULL DEFAULT false`, added in migration `0026`. Expose it on `UserPublic` as `is_support?: boolean` beside the existing `is_super_admin`. `schemas/account.ts` is owned by the billing agent this wave, so whoever needs the field reports it rather than editing that file.

A helper `canModerate(user)` returns `user.is_super_admin === true || user.is_support === true`, and every moderation route and screen goes through it. One function, no inline checks.

## Shared schemas: `packages/shared/src/schemas/community.ts` (new file)

```text
Nickname            3-24 chars, /^[a-z0-9][a-z0-9_-]*$/i, lowercased for uniqueness.
                    Rejected: anything equal (case-insensitively) to the poster's own profile names
                    or the local part of their email. The API enforces this, not just the UI.
PostKind            'post' | 'story' | 'routine'
PostStatus          'published' | 'hidden' | 'removed'
ReportReason        'child_safety' | 'personal_information' | 'harassment' | 'spam' | 'other'
CommunityProfileSchema, CommunityPostSchema, CommunityCommentSchema, CommunityReportSchema
CreatePostBodySchema, CreateCommentBodySchema, CreateReportBodySchema, SetNicknameBodySchema
FeedResponseSchema  { posts: CommunityPost[], next_cursor: string | null }
```

Every author is returned as `{ nickname, is_support }` only. **Never** a user id, an email, a profile name or an avatar from the private app. That is the whole point of the nickname.

## API: `apps/api/src/routes/community.ts` (new), mounted under `${BASE_PATH}/api`

| Method | Path | Auth |
|---|---|---|
| GET | `/community/feed?cursor=&kind=` | **public**, `status='published'` only |
| GET | `/community/posts/:id` | **public**, published only (moderators also see hidden) |
| GET | `/community/posts/:id/comments` | **public**, published only |
| GET | `/community/me` | auth: my nickname, or null if unset |
| PUT | `/community/me/nickname` | auth, **once**: 409 `nickname_already_set` if one exists |
| POST | `/community/posts` | auth + nickname required (409 `nickname_required`) |
| PATCH | `/community/posts/:id` | author only |
| DELETE | `/community/posts/:id` | author, or moderator (moderator sets `removed`) |
| POST | `/community/posts/:id/comments` | auth + nickname |
| DELETE | `/community/comments/:id` | author or moderator |
| POST | `/community/reports` | auth |
| GET | `/community/moderation/reports?status=` | `canModerate` only, else 403 |
| POST | `/community/moderation/reports/:id/resolve` | `canModerate`; body `{ action: 'hide'|'remove'|'dismiss', note? }` |

Rules that are not optional:
- **Rate limit** posting, commenting and reporting. `@fastify/rate-limit` is already a dependency and already configured for other routes — follow how they do it.
- Errors use the existing shape `{ error: { code, message } }`.
- A locked device (`sessions.locked_profile_id`, see CONTRACTS.md) must NOT be able to post or comment without the PIN. The server is the gate, not the UI.
- Public responses must be safe to cache and must never leak a private field.

## Web

Routes: `/community/` (feed), `/community/post/?id=`, `/community/new/`, `/settings/community/` (nickname + moderation entry). Static export, ids via `?id=`, `useSearchParams()` inside `<Suspense>` — same as every other screen.

Components under `apps/web/components/community/`: `CommunityFeed`, `PostCard`, `PostComposer`, `PostDetail`, `CommentList`, `NicknameSetup`, `ReportSheet`, `moderation/ReportQueue`.

- `NicknameSetup` states plainly, on screen, that the nickname is public and should not be the person's real name: "Anyone can see this. Don't use your real name or {name}'s." It is chosen once, and the screen says so before saving.
- **The PIN gate:** reaching the community from a person's own locked view requires the team PIN. Reuse the existing PIN overlay (`components/pin/PinPad.tsx`, and the pattern `components/settings/LockSheet.tsx` uses) — do not write a second PIN flow.
- Every post and comment carries a Report control. Reporting is one tap plus a reason.
- Offline: show the standard offline state. No optimistic posting, because there is no outbox for this.
- Images and audio go through the existing `lib/data/media.ts` (`pickAndStoreImage`, `useMediaUrl`) and the existing `/media` endpoint.
- Sharing a story offers a switch for whether the recorded audio goes with it (`include_audio`), defaulting to off.
