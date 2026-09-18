import { mkdtemp, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { connectionUrl } from '../scripts/embedded.mjs';
import { accounts, account_members, invites, users } from '../src/db/schema/accounts.js';
import { profile_members, profiles } from '../src/db/schema/profiles.js';
import { locations } from '../src/db/schema/locations.js';
import { activities, activity_steps, recurrence_skips } from '../src/db/schema/activities.js';
import { schedule_items, step_completions } from '../src/db/schema/schedule.js';
import { rewards } from '../src/db/schema/rewards.js';
import { chip_ledger } from '../src/db/schema/chips.js';
import { social_stories, story_pages } from '../src/db/schema/stories.js';
import { media } from '../src/db/schema/media.js';
import { railsId, railsLocationId } from '../src/import/ids.js';
import type { ImportSummary } from '../src/import/importRails.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DB = 'rails_fixture';
const FIXTURE_SQL = path.join(__dirname, 'fixtures', 'rails-schema.sql');
const RAILS_STORAGE_DIR = path.join(__dirname, 'fixtures', 'rails-storage');

/** Rails ids from fixtures/rails-schema.sql, for readable assertions below. */
const RAILS_ACCOUNT_ID = 1;
const RAILS_PROFILE_ID = 1;

/**
 * Creates `rails_fixture` on the embedded server if it isn't there yet.
 * Not `ensureDatabase`/`ensureServer` from scripts/embedded.mjs: those
 * `start()` the server, and by the time any test file runs, globalSetup
 * (in a separate process — vitest forks one per file) has already started
 * it; calling `start()` again here would try to bind the same data
 * directory twice and fail with a stale-lock error.
 */
async function ensureFixtureDatabase(): Promise<void> {
  const admin = postgres(connectionUrl('postgres'));
  try {
    const existing = await admin`select 1 from pg_database where datname = ${FIXTURE_DB}`;
    if (existing.length === 0) {
      await admin.unsafe(`create database ${FIXTURE_DB}`);
    }
  } finally {
    await admin.end({ timeout: 5 });
  }
}

async function loadFixture(): Promise<void> {
  await ensureFixtureDatabase();
  const url = connectionUrl(FIXTURE_DB);
  const sql = postgres(url);
  try {
    await sql`DROP SCHEMA public CASCADE`;
    await sql`CREATE SCHEMA public`;
    await sql.file(FIXTURE_SQL);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/**
 * `db`, `importRails` and `openRailsMediaSource` all pull in `src/env.ts` (parsed once, at
 * import time, from `process.env`), so they're loaded dynamically here — after
 * `process.env.UPLOAD_DIR` is pointed at a throwaway temp dir in `beforeAll` below — rather
 * than as static imports, which would run before that assignment and lock in whatever
 * `UPLOAD_DIR` this process started with. Same reasoning as `globalSetup.ts`.
 */
async function loadDeps() {
  const { db } = await import('../src/db/client.js');
  const { importRails } = await import('../src/import/importRails.js');
  const { openRailsMediaSource } = await import('../src/import/media.js');
  return { db, importRails, openRailsMediaSource };
}

describe('import-rails', () => {
  let deps: Awaited<ReturnType<typeof loadDeps>>;
  let uploadDir: string;
  let dryRunResult: ImportSummary;
  let filesAfterDryRun: string[];
  let firstRun: ImportSummary;

  beforeAll(async () => {
    uploadDir = await mkdtemp(path.join(os.tmpdir(), 'chipperly-import-media-'));
    process.env.UPLOAD_DIR = uploadDir;
    deps = await loadDeps();

    await loadFixture();
    const mediaSource = deps.openRailsMediaSource({ railsStorageDir: RAILS_STORAGE_DIR });

    dryRunResult = await deps.importRails({ sourceUrl: connectionUrl(FIXTURE_DB), dryRun: true, sendResetEmails: false, mediaSource });
    // Captured before the real run below writes anything, so it can only reflect the dry run's own effect.
    filesAfterDryRun = await readdir(uploadDir, { recursive: true }).catch(() => []);

    firstRun = await deps.importRails({ sourceUrl: connectionUrl(FIXTURE_DB), dryRun: false, sendResetEmails: false, mediaSource });
  });

  it('reports one account with a count per table', () => {
    expect(firstRun.dry_run).toBe(false);
    expect(firstRun.accounts).toHaveLength(1);
    const summary = firstRun.accounts[0]!;
    expect(summary.rails_account_id).toBe(RAILS_ACCOUNT_ID);
    expect(summary.counts).toMatchObject({
      users: 2,
      accounts: 1,
      account_members: 2,
      profile_members: 1,
      profiles: 1,
      locations: 2,
      chip_ledger: 2,
      activities: 4,
      recurrence_skips: 2,
      activity_steps: 2,
      schedule_items: 2,
      step_completions: 1,
      rewards: 1,
      choice_options: 1,
      social_stories: 1,
      story_pages: 1,
      invites: 1,
      // activity, profile avatar, story page, reward, choice option, location: one resolved media row each.
      media: 6,
      // the story's video attachment, which has no column in our model.
      media_skipped: 1,
    });
  });

  it('notes the reward with no profile_id and the invite that must be resent', () => {
    const notes = firstRun.accounts[0]!.notes.join('\n');
    expect(notes).toMatch(/reward\(s\) have no profile_id/);
    expect(notes).toMatch(/rails-pending@example\.com.*re-issued/);
  });

  it('notes the story video as skipped, with no storage-source note (a source was given)', () => {
    const notes = firstRun.accounts[0]!.notes.join('\n');
    expect(notes).toMatch(/social story 1 .*video attachment skipped/);
    expect(notes).not.toMatch(/no storage source given/);
  });

  it('imports the admin and member with the right roles', async () => {
    const accountId = railsId('accounts', RAILS_ACCOUNT_ID);
    const members = await deps.db.select().from(account_members).where(eq(account_members.account_id, accountId));
    expect(members).toHaveLength(2);
    const admin = members.find((m) => m.user_id === railsId('users', 1));
    const aunt = members.find((m) => m.user_id === railsId('users', 2));
    expect(admin?.role).toBe('admin');
    expect(aunt?.role).toBe('member');

    const [adminUser] = await deps.db.select().from(users).where(eq(users.id, railsId('users', 1)));
    expect(adminUser?.email).toBe('rails-parent@example.com'); // lowercased
    expect(adminUser?.auth_provider).toBe('rails_import');
    expect(adminUser?.password_hash).toBeNull();

    const assigned = await deps.db
      .select()
      .from(profile_members)
      .where(eq(profile_members.user_id, railsId('users', 2)));
    expect(assigned).toHaveLength(1);
    expect(assigned[0]?.relationship_label).toBe('Aunt');
  });

  it('turns each distinct location string into its own row, with the token board goal, reward and photo', async () => {
    const profileId = railsId('profiles', RAILS_PROFILE_ID);
    const rows = await deps.db.select().from(locations).where(eq(locations.profile_id, profileId));
    expect(rows).toHaveLength(2);

    const home = rows.find((r) => r.name === 'Home');
    const dads = rows.find((r) => r.name === 'Dads');
    expect(home).toBeDefined();
    expect(dads).toBeDefined();
    expect(home?.emoji).toBe('🏠');
    expect(home?.chip_goal).toBe(10);
    expect(home?.working_for_reward_id).toBe(railsId('rewards', 1));
    expect(dads?.chip_goal).toBe(5);
    expect(dads?.working_for_reward_id).toBeNull();
    expect(dads?.photo_id).toBeNull(); // no location_photos row for "Dads"

    expect(home?.id).toBe(railsLocationId(RAILS_PROFILE_ID, 'Home'));
    expect(home?.photo_id).toBe(railsId('active_storage_blobs', 7)); // blob 7 -> LocationPhoto 1 ("Home")
  });

  it('credits the token board balance to the chip ledger, one adjust row per location', async () => {
    const profileId = railsId('profiles', RAILS_PROFILE_ID);
    const ledger = await deps.db.select().from(chip_ledger).where(eq(chip_ledger.profile_id, profileId));
    expect(ledger).toHaveLength(2);
    const homeEntry = ledger.find((row) => row.location_id === railsLocationId(RAILS_PROFILE_ID, 'Home'));
    expect(homeEntry?.delta).toBe(4);
    expect(homeEntry?.reason).toBe('adjust');
  });

  it('sets photo_id on the activity with a Rails attachment, and imports the media row as webp', async () => {
    const activityId = railsId('activities', 1); // "Brush teeth", has active_storage_attachments row 1
    const [activity] = await deps.db.select().from(activities).where(eq(activities.id, activityId));
    const expectedMediaId = railsId('active_storage_blobs', 1);
    expect(activity?.photo_id).toBe(expectedMediaId);

    const [mediaRow] = await deps.db.select().from(media).where(eq(media.id, expectedMediaId));
    expect(mediaRow?.kind).toBe('image');
    expect(mediaRow?.status).toBe('ready');
    expect(mediaRow?.content_type).toBe('image/webp');
    expect(mediaRow?.width).toBe(24);
    expect(mediaRow?.height).toBe(24);
    expect(mediaRow?.bytes).toBeGreaterThan(0);

    // Actually stored as webp under UPLOAD_DIR/<account>/<media>.webp.
    const accountId = railsId('accounts', RAILS_ACCOUNT_ID);
    const files = await readdir(path.join(uploadDir, accountId));
    expect(files).toContain(`${expectedMediaId}.webp`);
  });

  it('sets avatar_photo_id on the profile from its Rails attachment', async () => {
    const [profile] = await deps.db.select().from(profiles).where(eq(profiles.id, railsId('profiles', RAILS_PROFILE_ID)));
    expect(profile?.avatar_photo_id).toBe(railsId('active_storage_blobs', 2));
  });

  it('turns a routine into an activity with steps copied from the referenced activities', async () => {
    const routineActivityId = railsId('routines', 1);
    const [routineActivity] = await deps.db.select().from(activities).where(eq(activities.id, routineActivityId));
    expect(routineActivity?.name).toBe('Morning routine');
    expect(routineActivity?.recurrence).toBe('weekdays');
    expect(routineActivity?.photo_id).toBeNull(); // routines have no :photo attachment in Rails

    const steps = await deps.db
      .select()
      .from(activity_steps)
      .where(eq(activity_steps.activity_id, routineActivityId))
      .orderBy(activity_steps.position);
    expect(steps).toHaveLength(2);
    expect(steps[0]?.name).toBe('Brush teeth'); // copied from routine_step -> activities(1)
    expect(steps[1]?.name).toBe('Make bed'); // copied from routine_step -> activities(3)
    expect(steps.every((step) => step.parent_step_id === null)).toBe(true); // Rails steps are flat

    const skip = await deps.db
      .select()
      .from(recurrence_skips)
      .where(eq(recurrence_skips.activity_id, routineActivityId));
    expect(skip).toHaveLength(1);
    expect(skip[0]?.date).toBe('2026-09-11');
  });

  it('maps events to schedule_items pointing at the right activity or routine-activity', async () => {
    const profileId = railsId('profiles', RAILS_PROFILE_ID);
    const items = await deps.db.select().from(schedule_items).where(eq(schedule_items.profile_id, profileId)).orderBy(schedule_items.position);
    expect(items).toHaveLength(2);
    expect(items[0]?.activity_id).toBe(railsId('activities', 2)); // event 1 -> activity "Pack bag"
    expect(items[0]?.completed_at).not.toBeNull();
    expect(items[1]?.activity_id).toBe(railsId('routines', 1)); // event 2 -> the routine-as-activity
    expect(items[1]?.completed_at).toBeNull();
  });

  it('turns each routine step completion into a step_completions row', async () => {
    const completion = await deps.db
      .select()
      .from(step_completions)
      .where(eq(step_completions.schedule_item_id, railsId('events', 2)));
    expect(completion).toHaveLength(1);
    expect(completion[0]?.activity_step_id).toBe(railsId('routine_steps', 1));
  });

  it('resolves first-then to the imported activity and reward', async () => {
    const [profile] = await deps.db.select().from(profiles).where(eq(profiles.id, railsId('profiles', RAILS_PROFILE_ID)));
    expect(profile?.first_then_activity_id).toBe(railsId('activities', 1));
    expect(profile?.first_then_reward_id).toBe(railsId('rewards', 1));
  });

  it('sets photo_id on the reward and the choice option from their own Rails attachments', async () => {
    const [reward] = await deps.db.select().from(rewards).where(eq(rewards.id, railsId('rewards', 1)));
    expect(reward?.photo_id).toBe(railsId('active_storage_blobs', 5));

    const [choice] = await deps.db.select().from(rewards).where(eq(rewards.id, railsId('choice_options', 1)));
    expect(choice?.always_available).toBe(true);
    expect(choice?.chip_cost).toBeNull();
    expect(choice?.name).toBe('Free draw time');
    expect(choice?.photo_id).toBe(railsId('active_storage_blobs', 6));
  });

  it('copies the global social story into the imported profile, with its page photo and derived cover', async () => {
    const profileId = railsId('profiles', RAILS_PROFILE_ID);
    const story = await deps.db.select().from(social_stories).where(eq(social_stories.profile_id, profileId));
    expect(story).toHaveLength(1);
    expect(story[0]?.title).toBe('Going to the dentist');

    const pages = await deps.db.select().from(story_pages).where(eq(story_pages.story_id, story[0]!.id));
    expect(pages).toHaveLength(1);
    expect(pages[0]?.text).toBe('We will see the dentist.'); // Rails column is `caption`
    const pageMediaId = railsId('active_storage_blobs', 3);
    expect(pages[0]?.photo_id).toBe(pageMediaId);

    // SocialStory has no :photo of its own in Rails, only :video (skipped) — the cover comes from
    // the first page's image.
    expect(story[0]?.cover_photo_id).toBe(pageMediaId);
  });

  it('only carries the pending invite, with a freshly issued token', async () => {
    const accountId = railsId('accounts', RAILS_ACCOUNT_ID);
    const rows = await deps.db.select().from(invites).where(eq(invites.account_id, accountId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.email).toBe('rails-pending@example.com');
    expect(rows[0]?.role).toBe('member'); // Rails care_team_member (3)
  });

  it('re-running the import is idempotent: same counts, same mapped values, no duplicate media', async () => {
    const mediaSource = deps.openRailsMediaSource({ railsStorageDir: RAILS_STORAGE_DIR });
    const secondRun = await deps.importRails({ sourceUrl: connectionUrl(FIXTURE_DB), dryRun: false, sendResetEmails: false, mediaSource });
    expect(secondRun.accounts[0]!.counts).toEqual(firstRun.accounts[0]!.counts);

    const profileId = railsId('profiles', RAILS_PROFILE_ID);
    const activityRows = await deps.db.select().from(activities).where(eq(activities.profile_id, profileId));
    expect(activityRows).toHaveLength(4);
    expect(activityRows.find((a) => a.id === railsId('activities', 1))?.photo_id).toBe(railsId('active_storage_blobs', 1));

    const ledger = await deps.db.select().from(chip_ledger).where(eq(chip_ledger.profile_id, profileId));
    expect(ledger).toHaveLength(2);
    const homeEntry = ledger.find((row) => row.location_id === railsLocationId(RAILS_PROFILE_ID, 'Home'));
    expect(homeEntry?.delta).toBe(4);

    const mediaRows = await deps.db.select().from(media).where(eq(media.id, railsId('active_storage_blobs', 1)));
    expect(mediaRows).toHaveLength(1); // still exactly one row for that blob, not duplicated
  });

  it('--dry-run counts media as found but does not download or write it', () => {
    expect(dryRunResult.dry_run).toBe(true);
    // Same "attachment resolved" count as the real run, computed without touching the Rails source or disk.
    expect(dryRunResult.accounts[0]!.counts.media).toBe(6);
    expect(dryRunResult.accounts[0]!.counts.media_skipped).toBe(1);
    expect(filesAfterDryRun).toHaveLength(0); // UPLOAD_DIR is untouched
  });

  it('--dry-run rolls back: nothing lands in the target database', async () => {
    const accountId = railsId('accounts', 999);
    // A second fixture account, isolated so this test doesn't collide with the shared fixture above.
    const url = connectionUrl(FIXTURE_DB);
    const sql = postgres(url);
    try {
      await sql`insert into accounts (id, account_type, created_at, updated_at) values (999, 0, now(), now())`;
      await sql`insert into users (id, email_address, first_name, last_name, created_at, updated_at) values (999, 'rails-dryrun@example.com', 'Dry', 'Run', now(), now())`;
      await sql`insert into account_memberships (account_id, user_id, role) values (999, 999, 0)`;
    } finally {
      await sql.end({ timeout: 5 });
    }

    const dryRunResult2 = await deps.importRails({ sourceUrl: url, dryRun: true, onlyAccountId: 999, sendResetEmails: false });
    expect(dryRunResult2.dry_run).toBe(true);
    expect(dryRunResult2.accounts[0]!.counts.accounts).toBe(1); // reported as if it ran

    const [row] = await deps.db.select().from(accounts).where(eq(accounts.id, accountId));
    expect(row).toBeUndefined(); // but nothing was actually committed
  });

  it('without any storage flag, notes attachments as skipped instead of fetching them', async () => {
    // A fresh, isolated account/profile/activity/attachment — not touched by any run above — so its
    // media row genuinely doesn't exist yet (unlike blobs 1-7, already imported by `firstRun`).
    const url = connectionUrl(FIXTURE_DB);
    const sql = postgres(url);
    try {
      await sql`insert into accounts (id, account_type, created_at, updated_at) values (998, 0, now(), now())`;
      await sql`insert into users (id, email_address, first_name, last_name, created_at, updated_at) values (998, 'rails-nostorage@example.com', 'No', 'Storage', now(), now())`;
      await sql`insert into account_memberships (account_id, user_id, role) values (998, 998, 0)`;
      await sql`insert into profiles (id, account_id, name, first_then_state, token_board_state, created_at, updated_at) values (998, 998, 'Fresh Kid', '{}', '{}', now(), now())`;
      await sql`insert into activities (id, profile_id, name, skipped_dates, created_at, updated_at) values (998, 998, 'Fresh activity', '[]', now(), now())`;
      await sql`insert into active_storage_blobs (id, key, filename, content_type, byte_size, service_name, created_at) values (998, 'freshactphotokey', 'fresh.png', 'image/png', 127, 'local', now())`;
      await sql`insert into active_storage_attachments (id, blob_id, record_type, record_id, name, created_at) values (998, 998, 'Activity', 998, 'photo', now())`;
    } finally {
      await sql.end({ timeout: 5 });
    }

    const result = await deps.importRails({ sourceUrl: url, dryRun: true, onlyAccountId: 998, sendResetEmails: false });
    const summary = result.accounts[0]!;
    // The profile also gets its own copy of the shared "Going to the dentist" story: its page image
    // (blob 3) was already imported by `firstRun` above, so it's re-pointed via the existing-row path
    // (counted as `media`, not `_media_no_storage`) even with no source given here; only the fresh
    // activity photo (blob 998, never resolved before) is genuinely skipped for lack of a source. The
    // story's video (blob 4) is always skipped, storage source or not.
    expect(summary.counts.media).toBe(1);
    expect(summary.counts.media_skipped).toBe(1);
    expect(summary.notes.join('\n')).toMatch(/media: 1 attachment\(s\) found, skipped \(no storage source given\)/);
  });
});
