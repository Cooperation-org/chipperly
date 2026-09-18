import { createHash, randomBytes } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import type { AccountKind } from '@chipperly/shared/schemas/account';
import { env } from '../env.js';
import { db } from '../db/client.js';
import { account_members, accounts, invites, password_resets, users } from '../db/schema/accounts.js';
import { profile_members, profiles } from '../db/schema/profiles.js';
import { locations } from '../db/schema/locations.js';
import { activities, activity_steps, recurrence_skips } from '../db/schema/activities.js';
import { schedule_items, step_completions } from '../db/schema/schedule.js';
import { rewards } from '../db/schema/rewards.js';
import { chip_ledger } from '../db/schema/chips.js';
import { social_stories, story_pages } from '../db/schema/stories.js';
import { sendMail } from '../lib/mailer.js';
import { openRailsSource, type RailsSource } from './source.js';
import { railsId, railsLocationId } from './ids.js';
import { excludedSet } from './upsert.js';
import { buildAttachmentIndex, resolveMediaId, type MediaLookup, type RailsMediaSource } from './media.js';
import {
  displayNameFor,
  hhmmFromDate,
  isoDateFromDate,
  mapAccountKind,
  mapInviteRole,
  mapMembershipRole,
  mapRecurrence,
  parseFirstThenState,
  parseProfileIds,
  parseSkippedDates,
  parseTokenBoardState,
  weekdayFromDate,
} from './mapping.js';
import type { RailsAccountRow, RailsActivityRow, RailsProfileRow, RailsRoutineRow } from './types.js';

/** Whatever `db.transaction(cb)` hands its callback; matches `seed/seedProfile.ts`'s `Tx`. */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface ImportOptions {
  readonly sourceUrl: string;
  readonly dryRun: boolean;
  readonly onlyAccountId?: number;
  readonly sendResetEmails: boolean;
  /** Where to read Rails Active Storage blobs from; unset = photos/videos are counted but not fetched. */
  readonly mediaSource?: RailsMediaSource;
}

export interface AccountSummary {
  readonly rails_account_id: number;
  readonly account_id: string;
  readonly counts: Record<string, number>;
  readonly notes: string[];
}

export interface ImportSummary {
  readonly dry_run: boolean;
  readonly accounts: AccountSummary[];
  readonly reset_emails_sent: number;
}

/** Thrown inside the per-account transaction to force a rollback for `--dry-run`; never escapes `importOneAccount`. */
class DryRunRollback extends Error {}

const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/**
 * Same shape as `sendVerificationEmail`/the `/auth/password/forgot` handler
 * in `routes/auth.ts`, duplicated here rather than exported from there:
 * this is the only caller outside the auth routes and the two are small.
 */
async function sendPasswordResetLink(userId: string, email: string): Promise<void> {
  const rawToken = randomBytes(32).toString('base64url');
  await db.insert(password_resets).values({
    id: uuidv7(),
    user_id: userId,
    token_hash: hashToken(rawToken),
    expires_at: Date.now() + PASSWORD_RESET_TTL_MS,
    used_at: null,
  });
  const link = `${env.APP_ORIGIN ?? ''}${env.BASE_PATH}/reset-password/?token=${rawToken}`;
  await sendMail({
    to: email,
    subject: 'Set your Chipperly password',
    text: `Your Chipperly account was moved over from the beta. Set a password to sign in: ${link}`,
  });
}

function kindLabel(kind: AccountKind): string {
  return kind === 'individual' ? 'Account' : kind === 'household' ? 'Household' : 'Agency';
}

export async function importRails(options: ImportOptions): Promise<ImportSummary> {
  const source = openRailsSource(options.sourceUrl);
  const accountSummaries: AccountSummary[] = [];
  let resetEmailsSent = 0;
  try {
    // `active_storage_attachments`/`_blobs` are global tables (no account column), same as
    // `social_stories`, so they're fetched once for the whole run rather than per account.
    const [attachments, blobs] = await Promise.all([source.allAttachments(), source.allBlobs()]);
    const media: MediaLookup = { index: buildAttachmentIndex(attachments, blobs), source: options.mediaSource, dryRun: options.dryRun };

    const railsAccounts = await source.accounts(options.onlyAccountId);
    for (const railsAccount of railsAccounts) {
      const outcome = await importOneAccount(source, railsAccount, options.dryRun, media);
      accountSummaries.push(outcome.summary);
      if (options.sendResetEmails && !options.dryRun) {
        for (const user of outcome.importedUsers) {
          await sendPasswordResetLink(user.id, user.email);
          resetEmailsSent += 1;
        }
      }
    }
  } finally {
    await source.close();
  }
  return { dry_run: options.dryRun, accounts: accountSummaries, reset_emails_sent: resetEmailsSent };
}

async function importOneAccount(
  source: RailsSource,
  railsAccount: RailsAccountRow,
  dryRun: boolean,
  media: MediaLookup,
): Promise<{ summary: AccountSummary; importedUsers: { id: string; email: string }[] }> {
  let outcome: { summary: AccountSummary; importedUsers: { id: string; email: string }[] } | undefined;
  try {
    await db.transaction(async (tx) => {
      outcome = await writeAccount(tx, source, railsAccount, media);
      if (dryRun) throw new DryRunRollback();
    });
  } catch (err) {
    if (!(err instanceof DryRunRollback)) throw err;
  }
  // Set on every path that doesn't throw past the catch above.
  return outcome as { summary: AccountSummary; importedUsers: { id: string; email: string }[] };
}

async function writeAccount(
  tx: Tx,
  source: RailsSource,
  railsAccount: RailsAccountRow,
  media: MediaLookup,
): Promise<{ summary: AccountSummary; importedUsers: { id: string; email: string }[] }> {
  const counts: Record<string, number> = {};
  const notes: string[] = [];
  const bump = (key: string, n = 1): void => {
    counts[key] = (counts[key] ?? 0) + n;
  };
  const userUuid = (railsUserId: number): string => railsId('users', railsUserId);

  // --- users (password_hash/pin_hash/auth_provider are never overwritten on re-import, see below) ---
  const memberships = await source.membershipsForAccount(railsAccount.id);
  const railsUsers = await source.usersByIds([...new Set(memberships.map((m) => m.user_id))]);
  const importedUsers: { id: string; email: string }[] = [];
  for (const u of railsUsers) {
    const id = userUuid(u.id);
    const email = u.email_address.toLowerCase();
    const emailVerifiedAt = u.email_verified_at ? u.email_verified_at.getTime() : Date.now();
    // `auth_provider` is typed `'google' | 'apple'` in db/schema/accounts.ts (the target schema this task
    // doesn't own); Postgres itself has no such check, so a raw insert carries the honest value the task
    // asks for ('rails_import') without touching that schema file.
    await tx.execute(sql`
      insert into users (id, email, password_hash, auth_provider, auth_provider_id, display_name, pin_hash, email_verified_at, created_at)
      values (${id}, ${email}, null, 'rails_import', null, ${displayNameFor(u)}, null, ${emailVerifiedAt}, ${u.created_at.getTime()})
      on conflict (id) do update set
        email = excluded.email,
        display_name = excluded.display_name,
        email_verified_at = excluded.email_verified_at
    `);
    importedUsers.push({ id, email });
    bump('users');
  }

  const adminMembership = memberships.find((m) => m.role === 0) ?? memberships[0];
  if (!adminMembership) notes.push(`account ${railsAccount.id}: no memberships in Rails; skipped (nothing to attribute rows to)`);
  if (!adminMembership) {
    return { summary: { rails_account_id: railsAccount.id, account_id: '', counts, notes }, importedUsers: [] };
  }
  const adminUserId = userUuid(adminMembership.user_id);

  // --- account ---
  const profileRows = await source.profilesForAccount(railsAccount.id);
  const kind = mapAccountKind(railsAccount.account_type);
  const accountId = railsId('accounts', railsAccount.id);
  const accountName =
    profileRows.length > 0 ? `${profileRows[0]!.name}'s ${kindLabel(kind)}` : `Imported ${kindLabel(kind)} ${railsAccount.id}`;
  await tx
    .insert(accounts)
    .values({ id: accountId, kind, name: accountName, created_at: railsAccount.created_at.getTime() })
    .onConflictDoUpdate({ target: accounts.id, set: excludedSet(accounts) });
  bump('accounts');

  for (const m of memberships) {
    const role = mapMembershipRole(m.role);
    await tx
      .insert(account_members)
      .values({ account_id: accountId, user_id: userUuid(m.user_id), role })
      .onConflictDoUpdate({ target: [account_members.account_id, account_members.user_id], set: { role } });
    bump('account_members');
  }

  // --- profile_members (from profile_assignments) ---
  const profileIds = new Set(profileRows.map((p) => p.id));
  const assignments = await source.profileAssignmentsForProfiles([...profileIds]);
  for (const a of assignments) {
    await tx
      .insert(profile_members)
      .values({ profile_id: railsId('profiles', a.profile_id), user_id: userUuid(a.user_id), relationship_label: a.relationship_label })
      .onConflictDoUpdate({
        target: [profile_members.profile_id, profile_members.user_id],
        set: { relationship_label: a.relationship_label },
      });
    bump('profile_members');
  }

  const rewardsWithoutProfile = await source.rewardsWithoutProfileForAccount(railsAccount.id);
  if (rewardsWithoutProfile.length > 0) {
    notes.push(
      `account ${railsAccount.id}: ${rewardsWithoutProfile.length} reward(s) have no profile_id in Rails (ids ${rewardsWithoutProfile.map((r) => r.id).join(', ')}) and were not imported`,
    );
  }

  for (const p of profileRows) {
    await writeProfile(tx, source, p, accountId, adminUserId, bump, notes, media);
  }

  if (profileRows.length > 0) {
    await writeSocialStories(tx, source, profileRows, accountId, adminUserId, bump, notes, media);
  }

  await writePendingInvites(tx, source, railsAccount.id, accountId, adminUserId, profileIds, bump, notes);

  // One summary line instead of one note per attachment when no --rails-storage-dir/--rails-s3-* was given.
  const noStorageCount = counts['_media_no_storage'];
  if (noStorageCount) {
    delete counts['_media_no_storage'];
    notes.push(`media: ${noStorageCount} attachment(s) found, skipped (no storage source given)`);
  }

  return { summary: { rails_account_id: railsAccount.id, account_id: accountId, counts, notes }, importedUsers };
}

async function writeProfile(
  tx: Tx,
  source: RailsSource,
  p: RailsProfileRow,
  accountId: string,
  adminUserId: string,
  bump: (key: string, n?: number) => void,
  notes: string[],
  media: MediaLookup,
): Promise<void> {
  const profileId = railsId('profiles', p.id);
  const profileUpdatedAt = p.updated_at.getTime();

  const [activityRows, routineRows, eventRows, rewardRows, choiceRows, locationPhotoRows] = await Promise.all([
    source.activitiesForProfile(p.id),
    source.routinesForProfile(p.id),
    source.eventsForProfile(p.id),
    source.rewardsForProfile(p.id),
    source.choiceOptionsForProfile(p.id),
    source.locationPhotosForProfile(p.id),
  ]);
  const routineStepRows = await source.routineStepsForRoutines(routineRows.map((r) => r.id));
  const stepCompletionRows = await source.stepCompletionsForEvents(eventRows.map((e) => e.id));

  const activityById = new Map(activityRows.map((a) => [a.id, a]));
  const tokenBoard = parseTokenBoardState(p.token_board_state);
  const firstThen = parseFirstThenState(p.first_then_state);
  const rewardIdsForProfile = new Set(rewardRows.map((r) => r.id));

  // --- locations: distinct names across activities.location, rewards.location, token_board_state keys ---
  const locationNames: string[] = [];
  const seen = new Set<string>();
  const addLocationName = (name: string | null): void => {
    if (name && !seen.has(name)) {
      seen.add(name);
      locationNames.push(name);
    }
  };
  for (const a of activityRows) addLocationName(a.location);
  for (const r of rewardRows) addLocationName(r.location);
  for (const name of Object.keys(tokenBoard)) addLocationName(name);

  // location_photos has no emoji column and isn't itself an entity in our model, only a photo source
  // matched by name below; every imported location still gets the 🏠 default emoji regardless.
  const locationPhotoIdByName = new Map(locationPhotoRows.map((lp) => [lp.location_name, lp.id]));

  const locationIdByName = new Map<string, string>();
  for (const [index, name] of locationNames.entries()) {
    const id = railsLocationId(p.id, name);
    locationIdByName.set(name, id);
    const board = tokenBoard[name];
    const workingForRewardId =
      board?.reward_id !== null && board?.reward_id !== undefined && rewardIdsForProfile.has(board.reward_id)
        ? railsId('rewards', board.reward_id)
        : null;
    const locationPhotoId = locationPhotoIdByName.get(name);
    const photo =
      locationPhotoId !== undefined
        ? await resolveMediaId(tx, media, 'LocationPhoto', locationPhotoId, 'photo', accountId, adminUserId, bump, notes)
        : { media_id: null };
    await tx
      .insert(locations)
      .values({
        id,
        profile_id: profileId,
        client_updated_at: profileUpdatedAt,
        updated_by: adminUserId,
        deleted_at: null,
        name,
        emoji: '🏠',
        photo_id: photo.media_id,
        position: index,
        chip_goal: Math.min(20, Math.max(1, board?.goal ?? 5)),
        working_for_reward_id: workingForRewardId,
      })
      .onConflictDoUpdate({ target: locations.id, set: excludedSet(locations) });
    bump('locations');

    if (board) {
      await tx
        .insert(chip_ledger)
        .values({
          id: railsId('chip_ledger_adjust', `${p.id}:${name}`),
          profile_id: profileId,
          client_updated_at: profileUpdatedAt,
          updated_by: adminUserId,
          deleted_at: null,
          location_id: id,
          delta: board.earned,
          reason: 'adjust',
          ref_id: null,
          created_at: profileUpdatedAt,
          created_by: adminUserId,
        })
        .onConflictDoUpdate({ target: chip_ledger.id, set: excludedSet(chip_ledger) });
      bump('chip_ledger');
    }
  }

  // --- activities + routines-as-activities-with-steps, one position sequence ordered by created_at ---
  type Entry = { readonly kind: 'activity'; readonly row: RailsActivityRow } | { readonly kind: 'routine'; readonly row: RailsRoutineRow };
  const entries: Entry[] = [
    ...activityRows.map((row): Entry => ({ kind: 'activity', row })),
    ...routineRows.map((row): Entry => ({ kind: 'routine', row })),
  ].sort((a, b) => a.row.created_at.getTime() - b.row.created_at.getTime());

  for (const [position, entry] of entries.entries()) {
    if (entry.kind === 'activity') {
      const a = entry.row;
      const activityId = railsId('activities', a.id);
      const recurrence = mapRecurrence(a.recurrence);
      const photo = await resolveMediaId(tx, media, 'Activity', a.id, 'photo', accountId, adminUserId, bump, notes);
      await tx
        .insert(activities)
        .values({
          id: activityId,
          profile_id: profileId,
          client_updated_at: a.updated_at.getTime(),
          updated_by: adminUserId,
          deleted_at: null,
          name: a.name,
          emoji: a.emoji,
          photo_id: photo.media_id,
          chip_value: a.chip_value ?? 0,
          location_id: a.location ? (locationIdByName.get(a.location) ?? null) : null,
          recurrence,
          recurrence_weekdays: recurrence === 'weekly' ? [weekdayFromDate(a.created_at)] : null,
          recurrence_time: hhmmFromDate(a.recurrence_time),
          position,
        })
        .onConflictDoUpdate({ target: activities.id, set: excludedSet(activities) });
      bump('activities');
      await writeRecurrenceSkips(tx, a.skipped_dates, activityId, profileId, a.updated_at.getTime(), adminUserId, bump);
    } else {
      const r = entry.row;
      const routineActivityId = railsId('routines', r.id);
      const recurrence = mapRecurrence(r.recurrence);
      await tx
        .insert(activities)
        .values({
          id: routineActivityId,
          profile_id: profileId,
          client_updated_at: r.updated_at.getTime(),
          updated_by: adminUserId,
          deleted_at: null,
          name: r.name ?? 'Routine',
          emoji: r.emoji,
          photo_id: null,
          chip_value: 0,
          location_id: null,
          recurrence,
          recurrence_weekdays: recurrence === 'weekly' ? [weekdayFromDate(r.created_at)] : null,
          recurrence_time: hhmmFromDate(r.recurrence_time),
          position,
        })
        .onConflictDoUpdate({ target: activities.id, set: excludedSet(activities) });
      bump('activities');

      const steps = routineStepRows.filter((s) => s.routine_id === r.id);
      for (const [stepPosition, step] of steps.entries()) {
        const sourceActivity = activityById.get(step.activity_id);
        if (!sourceActivity) {
          notes.push(`routine ${r.id} step ${step.id}: referenced activity ${step.activity_id} not found, step skipped`);
          continue;
        }
        await tx
          .insert(activity_steps)
          .values({
            id: railsId('routine_steps', step.id),
            profile_id: profileId,
            client_updated_at: step.updated_at.getTime(),
            updated_by: adminUserId,
            deleted_at: null,
            activity_id: routineActivityId,
            position: stepPosition,
            name: sourceActivity.name,
            emoji: sourceActivity.emoji,
            photo_id: null,
          })
          .onConflictDoUpdate({ target: activity_steps.id, set: excludedSet(activity_steps) });
        bump('activity_steps');
      }
      await writeRecurrenceSkips(tx, r.skipped_dates, routineActivityId, profileId, r.updated_at.getTime(), adminUserId, bump);
    }
  }

  // --- events -> schedule_items, routine_step_completions -> step_completions ---
  for (const e of eventRows) {
    const activityId = e.activity_id !== null ? railsId('activities', e.activity_id) : e.routine_id !== null ? railsId('routines', e.routine_id) : null;
    if (!activityId) {
      notes.push(`event ${e.id}: has neither activity_id nor routine_id, skipped`);
      continue;
    }
    await tx
      .insert(schedule_items)
      .values({
        id: railsId('events', e.id),
        profile_id: profileId,
        client_updated_at: e.updated_at.getTime(),
        updated_by: adminUserId,
        deleted_at: null,
        date: isoDateFromDate(e.scheduled_date),
        position: e.position ?? 0,
        activity_id: activityId,
        start_time: hhmmFromDate(e.start_time),
        part_of_day: null,
        // Rails has no column distinguishing a hand-added event from one materialized by its recurrence
        // generator (both end up as plain rows in `events`); every imported event is treated as 'manual'.
        // See docs/import-rails.md.
        source: 'manual',
        completed_at: e.completed_at ? e.completed_at.getTime() : null,
        completed_by: e.completed_at ? adminUserId : null,
      })
      .onConflictDoUpdate({ target: schedule_items.id, set: excludedSet(schedule_items) });
    bump('schedule_items');
  }

  for (const c of stepCompletionRows) {
    const step = routineStepRows.find((s) => s.id === c.routine_step_id);
    if (!step) continue;
    await tx
      .insert(step_completions)
      .values({
        id: railsId('routine_step_completions', c.id),
        profile_id: profileId,
        client_updated_at: c.updated_at.getTime(),
        updated_by: adminUserId,
        deleted_at: null,
        schedule_item_id: railsId('events', c.event_id),
        activity_step_id: railsId('routine_steps', step.id),
        // Rails only records existence + created_at for a completion, not who completed it.
        completed_at: c.created_at.getTime(),
        completed_by: adminUserId,
      })
      .onConflictDoUpdate({ target: step_completions.id, set: excludedSet(step_completions) });
    bump('step_completions');
  }

  // --- rewards + choice_options -> one `rewards` table, one position sequence ---
  interface RewardEntry {
    readonly source_table: 'rewards' | 'choice_options';
    readonly id: number;
    readonly created_at: Date;
    readonly updated_at: Date;
    readonly name: string;
    readonly emoji: string | null;
    readonly chip_cost: number | null;
    readonly location: string | null;
    readonly always_available: boolean;
  }
  const rewardEntries: RewardEntry[] = [
    ...rewardRows.map(
      (r): RewardEntry => ({
        source_table: 'rewards',
        id: r.id,
        created_at: r.created_at,
        updated_at: r.updated_at,
        name: r.name,
        emoji: r.emoji,
        chip_cost: r.chip_cost,
        location: r.location,
        always_available: false,
      }),
    ),
    ...choiceRows.map(
      (r): RewardEntry => ({
        source_table: 'choice_options',
        id: r.id,
        created_at: r.created_at,
        updated_at: r.updated_at,
        name: r.name,
        emoji: r.emoji,
        chip_cost: null,
        location: null,
        always_available: true,
      }),
    ),
  ].sort((a, b) => a.created_at.getTime() - b.created_at.getTime());

  for (const [position, r] of rewardEntries.entries()) {
    const recordType = r.source_table === 'rewards' ? 'Reward' : 'ChoiceOption';
    const photo = await resolveMediaId(tx, media, recordType, r.id, 'photo', accountId, adminUserId, bump, notes);
    await tx
      .insert(rewards)
      .values({
        id: railsId(r.source_table, r.id),
        profile_id: profileId,
        client_updated_at: r.updated_at.getTime(),
        updated_by: adminUserId,
        deleted_at: null,
        name: r.name,
        emoji: r.emoji,
        photo_id: photo.media_id,
        chip_cost: r.chip_cost,
        location_id: r.location ? (locationIdByName.get(r.location) ?? null) : null,
        always_available: r.always_available,
        position,
      })
      .onConflictDoUpdate({ target: rewards.id, set: excludedSet(rewards) });
    bump(r.source_table);
  }

  // --- profile row (avatar + first-then, resolved now that its activities/rewards exist) ---
  const firstThenActivityId = firstThen.activity_id !== null && activityById.has(firstThen.activity_id) ? railsId('activities', firstThen.activity_id) : null;
  const firstThenRewardId =
    firstThen.reward_id !== null && rewardIdsForProfile.has(firstThen.reward_id) ? railsId('rewards', firstThen.reward_id) : null;
  const avatarPhoto = await resolveMediaId(tx, media, 'Profile', p.id, 'photo', accountId, adminUserId, bump, notes);

  await tx
    .insert(profiles)
    .values({
      id: profileId,
      account_id: accountId,
      name: p.name,
      avatar_emoji: p.emoji,
      avatar_photo_id: avatarPhoto.media_id,
      share_token: null,
      first_then_activity_id: firstThenActivityId,
      first_then_reward_id: firstThenRewardId,
      settings: {},
      client_updated_at: profileUpdatedAt,
      updated_by: adminUserId,
      deleted_at: null,
    })
    .onConflictDoUpdate({ target: profiles.id, set: excludedSet(profiles) });
  bump('profiles');
}

async function writeRecurrenceSkips(
  tx: Tx,
  skippedDates: unknown,
  activityId: string,
  profileId: string,
  clientUpdatedAt: number,
  adminUserId: string,
  bump: (key: string, n?: number) => void,
): Promise<void> {
  for (const date of parseSkippedDates(skippedDates)) {
    await tx
      .insert(recurrence_skips)
      .values({
        id: railsId('recurrence_skip', `${activityId}:${date}`),
        profile_id: profileId,
        client_updated_at: clientUpdatedAt,
        updated_by: adminUserId,
        deleted_at: null,
        activity_id: activityId,
        date,
      })
      .onConflictDoUpdate({ target: recurrence_skips.id, set: excludedSet(recurrence_skips) });
    bump('recurrence_skips');
  }
}

/**
 * Social stories are global content in Rails (admin-authored, shared by
 * everyone), but `social_stories` here is profile-scoped, so each imported
 * profile gets its own copy, tied to the profile with a composite id
 * (`(profile, story)`) so re-imports upsert the same rows.
 */
async function writeSocialStories(
  tx: Tx,
  source: RailsSource,
  profileRows: readonly RailsProfileRow[],
  accountId: string,
  adminUserId: string,
  bump: (key: string, n?: number) => void,
  notes: string[],
  media: MediaLookup,
): Promise<void> {
  const stories = await source.allSocialStories();
  if (stories.length === 0) return;
  const pages = await source.socialStoryPages(stories.map((s) => s.id));

  // `SocialStory#video` has no column in our model at all (only its pages' images do); note it once
  // per Rails story regardless of how many profiles copy that story, not once per copy.
  for (const story of stories) {
    if (media.index.has(`SocialStory:${story.id}:video`)) {
      bump('media_skipped');
      notes.push(`social story ${story.id} ("${story.title}"): video attachment skipped, Chipperly has no place to put a story video`);
    }
  }

  for (const p of profileRows) {
    const profileId = railsId('profiles', p.id);
    for (const [position, story] of stories.entries()) {
      const storyId = railsId('social_stories', `${p.id}:${story.id}`);
      await tx
        .insert(social_stories)
        .values({
          id: storyId,
          profile_id: profileId,
          client_updated_at: story.updated_at.getTime(),
          updated_by: adminUserId,
          deleted_at: null,
          title: story.title,
          emoji: story.emoji,
          cover_photo_id: null,
          position: story.position ?? position,
        })
        .onConflictDoUpdate({ target: social_stories.id, set: excludedSet(social_stories) });
      bump('social_stories');

      // `SocialStory` itself has no `:photo` attachment (only `:video`, skipped above), so its cover
      // always comes from the first page's image, when that page has one.
      let coverPhotoId: string | null = null;
      const storyPages = pages.filter((pg) => pg.social_story_id === story.id);
      for (const [pageIndex, page] of storyPages.entries()) {
        const photo = await resolveMediaId(tx, media, 'SocialStoryPage', page.id, 'image', accountId, adminUserId, bump, notes);
        if (pageIndex === 0) coverPhotoId = photo.media_id;
        await tx
          .insert(story_pages)
          .values({
            id: railsId('story_pages', `${p.id}:${page.id}`),
            profile_id: profileId,
            client_updated_at: page.updated_at.getTime(),
            updated_by: adminUserId,
            deleted_at: null,
            story_id: storyId,
            position: page.position,
            // Rails column is `caption`, not `text`; our `story_pages.text` is not-null.
            text: page.caption ?? '',
            emoji: page.emoji,
            photo_id: photo.media_id,
          })
          .onConflictDoUpdate({ target: story_pages.id, set: excludedSet(story_pages) });
        bump('story_pages');
      }

      if (coverPhotoId !== null) {
        await tx.update(social_stories).set({ cover_photo_id: coverPhotoId }).where(eq(social_stories.id, storyId));
      }
    }
  }
}

async function writePendingInvites(
  tx: Tx,
  source: RailsSource,
  railsAccountId: number,
  accountId: string,
  adminUserId: string,
  importedProfileIds: ReadonlySet<number>,
  bump: (key: string, n?: number) => void,
  notes: string[],
): Promise<void> {
  const pending = await source.pendingInvitesForAccount(railsAccountId);
  const now = Date.now();
  for (const inv of pending) {
    if (inv.expires_at.getTime() <= now) {
      notes.push(`invite ${inv.id} (${inv.email_address}): already expired in Rails, not re-created`);
      continue;
    }
    const rawToken = randomBytes(32).toString('base64url');
    const profileIds = parseProfileIds(inv.profile_ids)
      .filter((pid) => importedProfileIds.has(pid))
      .map((pid) => railsId('profiles', pid));
    await tx
      .insert(invites)
      .values({
        id: railsId('invites', inv.id),
        account_id: accountId,
        email: inv.email_address.toLowerCase(),
        role: mapInviteRole(inv.role),
        profile_ids: profileIds,
        relationship_label: inv.relationship_label,
        token_hash: hashToken(rawToken),
        expires_at: inv.expires_at.getTime(),
        accepted_at: null,
        invited_by: adminUserId,
      })
      .onConflictDoUpdate({ target: invites.id, set: excludedSet(invites) });
    bump('invites');
    // A Rails invite token can't be carried over (it was never in our database), so every
    // pending invite gets a fresh one; the operator running this CLI needs the new link to
    // resend it, since it can't be recovered from the database afterwards.
    const link = `${env.APP_ORIGIN ?? ''}${env.BASE_PATH}/invite/?token=${rawToken}`;
    notes.push(`invite for ${inv.email_address}: re-issued, must be resent — ${link}`);
  }
}
