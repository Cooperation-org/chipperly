import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { connectionUrl } from '../scripts/embedded.mjs';
import { db } from '../src/db/client.js';
import { accounts, account_members, invites, users } from '../src/db/schema/accounts.js';
import { profile_members, profiles } from '../src/db/schema/profiles.js';
import { locations } from '../src/db/schema/locations.js';
import { activities, activity_steps, recurrence_skips } from '../src/db/schema/activities.js';
import { schedule_items, step_completions } from '../src/db/schema/schedule.js';
import { rewards } from '../src/db/schema/rewards.js';
import { chip_ledger } from '../src/db/schema/chips.js';
import { social_stories, story_pages } from '../src/db/schema/stories.js';
import { railsId, railsLocationId } from '../src/import/ids.js';
import { importRails, type ImportSummary } from '../src/import/importRails.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DB = 'rails_fixture';
const FIXTURE_SQL = path.join(__dirname, 'fixtures', 'rails-schema.sql');

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

describe('import-rails', () => {
  let firstRun: ImportSummary;

  beforeAll(async () => {
    await loadFixture();
    firstRun = await importRails({ sourceUrl: connectionUrl(FIXTURE_DB), dryRun: false, sendResetEmails: false });
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
    });
  });

  it('notes the reward with no profile_id and the invite that must be resent', () => {
    const notes = firstRun.accounts[0]!.notes.join('\n');
    expect(notes).toMatch(/reward\(s\) have no profile_id/);
    expect(notes).toMatch(/rails-pending@example\.com.*re-issued/);
  });

  it('imports the admin and member with the right roles', async () => {
    const accountId = railsId('accounts', RAILS_ACCOUNT_ID);
    const members = await db.select().from(account_members).where(eq(account_members.account_id, accountId));
    expect(members).toHaveLength(2);
    const admin = members.find((m) => m.user_id === railsId('users', 1));
    const aunt = members.find((m) => m.user_id === railsId('users', 2));
    expect(admin?.role).toBe('admin');
    expect(aunt?.role).toBe('member');

    const [adminUser] = await db.select().from(users).where(eq(users.id, railsId('users', 1)));
    expect(adminUser?.email).toBe('rails-parent@example.com'); // lowercased
    expect(adminUser?.auth_provider).toBe('rails_import');
    expect(adminUser?.password_hash).toBeNull();

    const assigned = await db
      .select()
      .from(profile_members)
      .where(eq(profile_members.user_id, railsId('users', 2)));
    expect(assigned).toHaveLength(1);
    expect(assigned[0]?.relationship_label).toBe('Aunt');
  });

  it('turns each distinct location string into its own row, with the token board goal and reward', async () => {
    const profileId = railsId('profiles', RAILS_PROFILE_ID);
    const rows = await db.select().from(locations).where(eq(locations.profile_id, profileId));
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

    expect(home?.id).toBe(railsLocationId(RAILS_PROFILE_ID, 'Home'));
  });

  it('credits the token board balance to the chip ledger, one adjust row per location', async () => {
    const profileId = railsId('profiles', RAILS_PROFILE_ID);
    const ledger = await db.select().from(chip_ledger).where(eq(chip_ledger.profile_id, profileId));
    expect(ledger).toHaveLength(2);
    const homeEntry = ledger.find((row) => row.location_id === railsLocationId(RAILS_PROFILE_ID, 'Home'));
    expect(homeEntry?.delta).toBe(4);
    expect(homeEntry?.reason).toBe('adjust');
  });

  it('turns a routine into an activity with steps copied from the referenced activities', async () => {
    const routineActivityId = railsId('routines', 1);
    const [routineActivity] = await db.select().from(activities).where(eq(activities.id, routineActivityId));
    expect(routineActivity?.name).toBe('Morning routine');
    expect(routineActivity?.recurrence).toBe('weekdays');

    const steps = await db
      .select()
      .from(activity_steps)
      .where(eq(activity_steps.activity_id, routineActivityId))
      .orderBy(activity_steps.position);
    expect(steps).toHaveLength(2);
    expect(steps[0]?.name).toBe('Brush teeth'); // copied from routine_step -> activities(1)
    expect(steps[1]?.name).toBe('Make bed'); // copied from routine_step -> activities(3)

    const skip = await db
      .select()
      .from(recurrence_skips)
      .where(eq(recurrence_skips.activity_id, routineActivityId));
    expect(skip).toHaveLength(1);
    expect(skip[0]?.date).toBe('2026-09-11');
  });

  it('maps events to schedule_items pointing at the right activity or routine-activity', async () => {
    const profileId = railsId('profiles', RAILS_PROFILE_ID);
    const items = await db.select().from(schedule_items).where(eq(schedule_items.profile_id, profileId)).orderBy(schedule_items.position);
    expect(items).toHaveLength(2);
    expect(items[0]?.activity_id).toBe(railsId('activities', 2)); // event 1 -> activity "Pack bag"
    expect(items[0]?.completed_at).not.toBeNull();
    expect(items[1]?.activity_id).toBe(railsId('routines', 1)); // event 2 -> the routine-as-activity
    expect(items[1]?.completed_at).toBeNull();
  });

  it('turns each routine step completion into a step_completions row', async () => {
    const completion = await db
      .select()
      .from(step_completions)
      .where(eq(step_completions.schedule_item_id, railsId('events', 2)));
    expect(completion).toHaveLength(1);
    expect(completion[0]?.activity_step_id).toBe(railsId('routine_steps', 1));
  });

  it('resolves first-then to the imported activity and reward', async () => {
    const [profile] = await db.select().from(profiles).where(eq(profiles.id, railsId('profiles', RAILS_PROFILE_ID)));
    expect(profile?.first_then_activity_id).toBe(railsId('activities', 1));
    expect(profile?.first_then_reward_id).toBe(railsId('rewards', 1));
  });

  it('imports choice_options as always-available rewards with no chip cost', async () => {
    const [choice] = await db.select().from(rewards).where(eq(rewards.id, railsId('choice_options', 1)));
    expect(choice?.always_available).toBe(true);
    expect(choice?.chip_cost).toBeNull();
    expect(choice?.name).toBe('Free draw time');
  });

  it('copies the global social story into the imported profile', async () => {
    const profileId = railsId('profiles', RAILS_PROFILE_ID);
    const story = await db.select().from(social_stories).where(eq(social_stories.profile_id, profileId));
    expect(story).toHaveLength(1);
    expect(story[0]?.title).toBe('Going to the dentist');
    const pages = await db.select().from(story_pages).where(eq(story_pages.story_id, story[0]!.id));
    expect(pages).toHaveLength(1);
    expect(pages[0]?.text).toBe('We will see the dentist.'); // Rails column is `caption`
  });

  it('only carries the pending invite, with a freshly issued token', async () => {
    const accountId = railsId('accounts', RAILS_ACCOUNT_ID);
    const rows = await db.select().from(invites).where(eq(invites.account_id, accountId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.email).toBe('rails-pending@example.com');
    expect(rows[0]?.role).toBe('member'); // Rails care_team_member (3)
  });

  it('re-running the import is idempotent: same counts, same mapped values, no duplicates', async () => {
    const secondRun = await importRails({ sourceUrl: connectionUrl(FIXTURE_DB), dryRun: false, sendResetEmails: false });
    expect(secondRun.accounts[0]!.counts).toEqual(firstRun.accounts[0]!.counts);

    const profileId = railsId('profiles', RAILS_PROFILE_ID);
    const activityRows = await db.select().from(activities).where(eq(activities.profile_id, profileId));
    expect(activityRows).toHaveLength(4);

    const ledger = await db.select().from(chip_ledger).where(eq(chip_ledger.profile_id, profileId));
    expect(ledger).toHaveLength(2);
    const homeEntry = ledger.find((row) => row.location_id === railsLocationId(RAILS_PROFILE_ID, 'Home'));
    expect(homeEntry?.delta).toBe(4);
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

    const dryRunResult = await importRails({ sourceUrl: url, dryRun: true, onlyAccountId: 999, sendResetEmails: false });
    expect(dryRunResult.dry_run).toBe(true);
    expect(dryRunResult.accounts[0]!.counts.accounts).toBe(1); // reported as if it ran

    const [row] = await db.select().from(accounts).where(eq(accounts.id, accountId));
    expect(row).toBeUndefined(); // but nothing was actually committed
  });
});
