import Dexie, { type EntityTable } from 'dexie';
import type { Location } from '@chipperly/shared/schemas/location';
import type { Activity, ActivityStep, RecurrenceSkip } from '@chipperly/shared/schemas/activity';
import type { Reward } from '@chipperly/shared/schemas/reward';
import type { DayPlan, ScheduleItem, StepCompletion } from '@chipperly/shared/schemas/schedule';
import type { ChipLedger } from '@chipperly/shared/schemas/chips';
import type { SocialStory, StoryPage } from '@chipperly/shared/schemas/story';
import type { AttitudeCheck } from '@chipperly/shared/schemas/attitude';
import type { MoodEvent } from '@chipperly/shared/schemas/mood';
import type { Profile } from '@chipperly/shared/schemas/profile';
import type { Account, UserPublic } from '@chipperly/shared/schemas/account';
import type { SyncedTable, MutationTable } from '@chipperly/shared/constants/tables';

/** One pending write, applied to the server in insertion order (`seq`). */
export interface OutboxEntry {
  seq?: number;
  id: string;
  table: MutationTable;
  op: 'upsert' | 'delete';
  row?: Record<string, unknown>;
  client_updated_at: number;
  attempts: number;
  created_at: number;
}

/** Device-local settings and session state: active profile/account, tokens, lock state, ... */
export interface KvEntry {
  key: string;
  value: unknown;
}

/**
 * Raw bytes, not a Blob: Safari/WebKit's IndexedDB throws
 * "Error preparing Blob/File data to be stored in object store" when a Blob
 * is structured-cloned into an object store (a long-standing WebKit bug, not
 * fixed as of this writing) -- an ArrayBuffer stores fine everywhere and is
 * reassembled into a Blob on read (lib/data/media.ts's useMediaUrl).
 */
export interface MediaBlobEntry {
  media_id: string;
  bytes: ArrayBuffer;
  type: string;
  uploaded: 0 | 1;
}

/** Pull cursor per profile: the highest `version` already applied. */
export interface SyncCursorEntry {
  profile_id: string;
  version: number;
}

/** Row shape for a given synced table name, one source of truth for lib/sync and lib/data callers. */
export type SyncedRow<T extends SyncedTable> = {
  locations: Location;
  activities: Activity;
  activity_steps: ActivityStep;
  recurrence_skips: RecurrenceSkip;
  rewards: Reward;
  schedule_items: ScheduleItem;
  step_completions: StepCompletion;
  chip_ledger: ChipLedger;
  social_stories: SocialStory;
  story_pages: StoryPage;
  attitude_checks: AttitudeCheck;
  mood_events: MoodEvent;
  day_plans: DayPlan;
}[T];

export class ChipperlyDB extends Dexie {
  locations!: EntityTable<Location, 'id'>;
  activities!: EntityTable<Activity, 'id'>;
  activity_steps!: EntityTable<ActivityStep, 'id'>;
  recurrence_skips!: EntityTable<RecurrenceSkip, 'id'>;
  rewards!: EntityTable<Reward, 'id'>;
  schedule_items!: EntityTable<ScheduleItem, 'id'>;
  step_completions!: EntityTable<StepCompletion, 'id'>;
  chip_ledger!: EntityTable<ChipLedger, 'id'>;
  social_stories!: EntityTable<SocialStory, 'id'>;
  story_pages!: EntityTable<StoryPage, 'id'>;
  attitude_checks!: EntityTable<AttitudeCheck, 'id'>;
  mood_events!: EntityTable<MoodEvent, 'id'>;
  day_plans!: EntityTable<DayPlan, 'id'>;

  profiles!: EntityTable<Profile, 'id'>;
  accounts!: EntityTable<Account, 'id'>;
  users!: EntityTable<UserPublic, 'id'>;

  outbox!: EntityTable<OutboxEntry, 'seq'>;
  kv!: EntityTable<KvEntry, 'key'>;
  media_blobs!: EntityTable<MediaBlobEntry, 'media_id'>;
  sync_cursors!: EntityTable<SyncCursorEntry, 'profile_id'>;

  constructor() {
    super('chipperly');
    this.version(1).stores({
      locations: 'id, profile_id',
      activities: 'id, profile_id',
      activity_steps: 'id, profile_id, activity_id',
      recurrence_skips: 'id, profile_id, activity_id',
      rewards: 'id, profile_id, [profile_id+location_id]',
      schedule_items: 'id, profile_id, [profile_id+date], [profile_id+activity_id]',
      step_completions: 'id, profile_id, schedule_item_id',
      chip_ledger: 'id, profile_id, [profile_id+location_id]',
      social_stories: 'id, profile_id',
      story_pages: 'id, profile_id, story_id',
      attitude_checks: 'id, profile_id',

      profiles: 'id, account_id',
      accounts: 'id',
      users: 'id',

      outbox: '++seq, id, table',
      kv: 'key',
      media_blobs: 'media_id',
      sync_cursors: 'profile_id',
    });

    // v2: adds mood_events (Chipper Chart). Every store repeated unchanged
    // per Dexie's versioning rules; only the new line actually changes anything.
    this.version(2).stores({
      locations: 'id, profile_id',
      activities: 'id, profile_id',
      activity_steps: 'id, profile_id, activity_id',
      recurrence_skips: 'id, profile_id, activity_id',
      rewards: 'id, profile_id, [profile_id+location_id]',
      schedule_items: 'id, profile_id, [profile_id+date], [profile_id+activity_id]',
      step_completions: 'id, profile_id, schedule_item_id',
      chip_ledger: 'id, profile_id, [profile_id+location_id]',
      social_stories: 'id, profile_id',
      story_pages: 'id, profile_id, story_id',
      attitude_checks: 'id, profile_id',
      mood_events: 'id, profile_id, [profile_id+date]',

      profiles: 'id, account_id',
      accounts: 'id',
      users: 'id',

      outbox: '++seq, id, table',
      kv: 'key',
      media_blobs: 'media_id',
      sync_cursors: 'profile_id',
    });

    // v3: adds the activity_steps.parent_step_id index (step tree).
    this.version(3).stores({
      locations: 'id, profile_id',
      activities: 'id, profile_id',
      activity_steps: 'id, profile_id, activity_id, parent_step_id',
      recurrence_skips: 'id, profile_id, activity_id',
      rewards: 'id, profile_id, [profile_id+location_id]',
      schedule_items: 'id, profile_id, [profile_id+date], [profile_id+activity_id]',
      step_completions: 'id, profile_id, schedule_item_id',
      chip_ledger: 'id, profile_id, [profile_id+location_id]',
      social_stories: 'id, profile_id',
      story_pages: 'id, profile_id, story_id',
      attitude_checks: 'id, profile_id',
      mood_events: 'id, profile_id, [profile_id+date]',

      profiles: 'id, account_id',
      accounts: 'id',
      users: 'id',

      outbox: '++seq, id, table',
      kv: 'key',
      media_blobs: 'media_id',
      sync_cursors: 'profile_id',
    });

    // v4: adds day_plans (caregiver note per day). Every store repeated unchanged, as Dexie requires.
    this.version(4).stores({
      locations: 'id, profile_id',
      activities: 'id, profile_id',
      activity_steps: 'id, profile_id, activity_id, parent_step_id',
      recurrence_skips: 'id, profile_id, activity_id',
      rewards: 'id, profile_id, [profile_id+location_id]',
      schedule_items: 'id, profile_id, [profile_id+date], [profile_id+activity_id]',
      step_completions: 'id, profile_id, schedule_item_id',
      chip_ledger: 'id, profile_id, [profile_id+location_id]',
      social_stories: 'id, profile_id',
      story_pages: 'id, profile_id, story_id',
      attitude_checks: 'id, profile_id',
      mood_events: 'id, profile_id, [profile_id+date]',
      day_plans: 'id, profile_id, [profile_id+date]',

      profiles: 'id, account_id',
      accounts: 'id',
      users: 'id',

      outbox: '++seq, id, table',
      kv: 'key',
      media_blobs: 'media_id',
      sync_cursors: 'profile_id',
    });
  }
}

export const db = new ChipperlyDB();

/**
 * Typed access to a synced table by name. `SyncedTable`'s members are
 * exactly `ChipperlyDB`'s synced-table property names, so this one cast
 * (instead of one per call site) is what connects the two.
 */
export function tableFor<T extends SyncedTable>(table: T): EntityTable<SyncedRow<T>, 'id'> {
  return (db as unknown as Record<SyncedTable, EntityTable<SyncedRow<T>, 'id'>>)[table];
}

/** Row shape for a `MutationTable`: a `SyncedRow` for the 11 synced tables, `Profile` for 'profiles'. */
export type MutationRow<T extends MutationTable> = T extends SyncedTable ? SyncedRow<T> : Profile;

/**
 * Like `tableFor`, but also covers 'profiles' (account-scoped, not one of
 * the 11 `SyncedTable`s, but still a valid `mutate.ts` target per
 * CONTRACTS.md's `MutationTable = SyncedTable | 'profiles'`).
 */
export function tableForMutation<T extends MutationTable>(table: T): EntityTable<MutationRow<T>, 'id'> {
  if (table === 'profiles') return db.profiles as unknown as EntityTable<MutationRow<T>, 'id'>;
  return tableFor(table as SyncedTable) as unknown as EntityTable<MutationRow<T>, 'id'>;
}
