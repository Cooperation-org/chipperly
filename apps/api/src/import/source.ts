import postgres from 'postgres';
import type {
  RailsAccountMembershipRow,
  RailsAccountRow,
  RailsActivityRow,
  RailsChoiceOptionRow,
  RailsEventRow,
  RailsInviteRow,
  RailsLocationPhotoRow,
  RailsProfileAssignmentRow,
  RailsProfileRow,
  RailsRewardRow,
  RailsRoutineRow,
  RailsRoutineStepCompletionRow,
  RailsRoutineStepRow,
  RailsSocialStoryPageRow,
  RailsSocialStoryRow,
  RailsUserRow,
} from './types.js';

/** A thin, read-only client for the old Rails database. One row-fetching method per table the importer needs. */
export function openRailsSource(url: string) {
  const sql = postgres(url, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
    // Rails primary/foreign keys are `bigint` (OID 20); postgres.js returns those as strings by
    // default to avoid precision loss above 2^53. Rails ids never get that large, so parse them
    // as plain numbers instead — every id field in ./types.ts is typed `number`, not `string`.
    types: {
      bigint: {
        to: 20,
        from: [20],
        serialize: (value: number) => String(value),
        parse: (raw: string) => Number(raw),
      },
    },
  });

  return {
    close: () => sql.end({ timeout: 5 }),

    accounts: (onlyAccountId?: number) =>
      onlyAccountId
        ? sql<RailsAccountRow[]>`select id, account_type, created_at from accounts where id = ${onlyAccountId}`
        : sql<RailsAccountRow[]>`select id, account_type, created_at from accounts order by id`,

    usersByIds: (ids: readonly number[]) =>
      ids.length === 0
        ? Promise.resolve([])
        : sql<RailsUserRow[]>`
            select id, email_address, first_name, last_name, email_verified_at, created_at
            from users where id in ${sql(ids)}`,

    membershipsForAccount: (accountId: number) =>
      sql<RailsAccountMembershipRow[]>`
        select account_id, user_id, role from account_memberships where account_id = ${accountId}`,

    profilesForAccount: (accountId: number) =>
      sql<RailsProfileRow[]>`
        select id, account_id, name, emoji, first_then_state, token_board_state, created_at, updated_at
        from profiles where account_id = ${accountId} order by id`,

    profileAssignmentsForProfiles: (profileIds: readonly number[]) =>
      profileIds.length === 0
        ? Promise.resolve([])
        : sql<RailsProfileAssignmentRow[]>`
            select user_id, profile_id, relationship_label
            from profile_assignments where profile_id in ${sql(profileIds)}`,

    locationPhotosForProfile: (profileId: number) =>
      sql<RailsLocationPhotoRow[]>`
        select profile_id, location_name from location_photos where profile_id = ${profileId}`,

    activitiesForProfile: (profileId: number) =>
      sql<RailsActivityRow[]>`
        select id, profile_id, name, emoji, chip_value, location, recurrence, recurrence_time, skipped_dates, created_at, updated_at
        from activities where profile_id = ${profileId} order by created_at, id`,

    routinesForProfile: (profileId: number) =>
      sql<RailsRoutineRow[]>`
        select id, profile_id, name, emoji, recurrence, recurrence_time, skipped_dates, created_at, updated_at
        from routines where profile_id = ${profileId} order by created_at, id`,

    routineStepsForRoutines: (routineIds: readonly number[]) =>
      routineIds.length === 0
        ? Promise.resolve([])
        : sql<RailsRoutineStepRow[]>`
            select id, routine_id, activity_id, position, updated_at
            from routine_steps where routine_id in ${sql(routineIds)} order by routine_id, position, id`,

    eventsForProfile: (profileId: number) =>
      sql<RailsEventRow[]>`
        select id, profile_id, activity_id, routine_id, scheduled_date, start_time, position, completed_at, updated_at
        from events where profile_id = ${profileId} order by scheduled_date, position, id`,

    stepCompletionsForEvents: (eventIds: readonly number[]) =>
      eventIds.length === 0
        ? Promise.resolve([])
        : sql<RailsRoutineStepCompletionRow[]>`
            select id, event_id, routine_step_id, created_at, updated_at
            from routine_step_completions where event_id in ${sql(eventIds)}`,

    rewardsForProfile: (profileId: number) =>
      sql<RailsRewardRow[]>`
        select id, profile_id, name, emoji, chip_cost, location, created_at, updated_at
        from rewards where profile_id = ${profileId} order by created_at, id`,

    rewardsWithoutProfileForAccount: (accountId: number) =>
      sql<{ id: number }[]>`
        select id from rewards where account_id = ${accountId} and profile_id is null`,

    choiceOptionsForProfile: (profileId: number) =>
      sql<RailsChoiceOptionRow[]>`
        select id, profile_id, name, emoji, created_at, updated_at
        from choice_options where profile_id = ${profileId} order by created_at, id`,

    allSocialStories: () =>
      sql<RailsSocialStoryRow[]>`select id, title, emoji, position, updated_at from social_stories order by position, id`,

    socialStoryPages: (storyIds: readonly number[]) =>
      storyIds.length === 0
        ? Promise.resolve([])
        : sql<RailsSocialStoryPageRow[]>`
            select id, social_story_id, position, caption, emoji, updated_at
            from social_story_pages where social_story_id in ${sql(storyIds)} order by social_story_id, position`,

    pendingInvitesForAccount: (accountId: number) =>
      sql<RailsInviteRow[]>`
        select id, account_id, email_address, role, profile_ids, relationship_label, accepted_at, archived_at, expires_at
        from invites
        where account_id = ${accountId} and accepted_at is null and archived_at is null`,
  };
}

export type RailsSource = ReturnType<typeof openRailsSource>;
