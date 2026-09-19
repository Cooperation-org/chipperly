/**
 * Row shapes read from the Rails database (`db/schema.rb`, committed as
 * docs/reference/rails-schema.rb). Only the columns the
 * importer uses are declared; extra Rails columns are ignored by the
 * `select` list in `source.ts`, not by omitting them here.
 */

export interface RailsAccountRow {
  readonly id: number;
  readonly account_type: number;
  readonly created_at: Date;
}

export interface RailsUserRow {
  readonly id: number;
  readonly email_address: string;
  readonly first_name: string | null;
  readonly last_name: string | null;
  readonly email_verified_at: Date | null;
  readonly created_at: Date;
}

export interface RailsAccountMembershipRow {
  readonly account_id: number;
  readonly user_id: number;
  readonly role: number;
}

export interface RailsProfileAssignmentRow {
  readonly user_id: number;
  readonly profile_id: number;
  readonly relationship_label: string | null;
}

export interface RailsProfileRow {
  readonly id: number;
  readonly account_id: number;
  readonly name: string;
  readonly emoji: string | null;
  readonly first_then_state: unknown;
  readonly token_board_state: unknown;
  readonly created_at: Date;
  readonly updated_at: Date;
}

export interface RailsLocationPhotoRow {
  readonly id: number;
  readonly profile_id: number;
  readonly location_name: string;
}

/** `active_storage_attachments`: one row per `has_one_attached` value actually set. */
export interface RailsActiveStorageAttachmentRow {
  readonly id: number;
  readonly blob_id: number;
  readonly record_type: string;
  readonly record_id: number;
  readonly name: string;
}

/** `active_storage_blobs`: the file itself, referenced by key into whichever `service_name` stored it. */
export interface RailsActiveStorageBlobRow {
  readonly id: number;
  readonly key: string;
  readonly filename: string;
  readonly content_type: string | null;
}

export interface RailsActivityRow {
  readonly id: number;
  readonly profile_id: number;
  readonly name: string;
  readonly emoji: string | null;
  readonly chip_value: number | null;
  readonly location: string | null;
  readonly recurrence: string | null;
  readonly recurrence_time: Date | null;
  readonly skipped_dates: unknown;
  readonly created_at: Date;
  readonly updated_at: Date;
}

export interface RailsRoutineRow {
  readonly id: number;
  readonly profile_id: number;
  readonly name: string | null;
  readonly emoji: string | null;
  readonly recurrence: string | null;
  readonly recurrence_time: Date | null;
  readonly skipped_dates: unknown;
  readonly created_at: Date;
  readonly updated_at: Date;
}

export interface RailsRoutineStepRow {
  readonly id: number;
  readonly routine_id: number;
  readonly activity_id: number;
  readonly position: number | null;
  readonly updated_at: Date;
}

export interface RailsEventRow {
  readonly id: number;
  readonly profile_id: number;
  readonly activity_id: number | null;
  readonly routine_id: number | null;
  readonly scheduled_date: Date;
  readonly start_time: Date | null;
  readonly position: number | null;
  readonly completed_at: Date | null;
  readonly updated_at: Date;
}

export interface RailsRoutineStepCompletionRow {
  readonly id: number;
  readonly event_id: number;
  readonly routine_step_id: number;
  readonly created_at: Date;
  readonly updated_at: Date;
}

export interface RailsRewardRow {
  readonly id: number;
  readonly profile_id: number | null;
  readonly name: string;
  readonly emoji: string | null;
  readonly chip_cost: number | null;
  readonly location: string | null;
  readonly created_at: Date;
  readonly updated_at: Date;
}

export interface RailsChoiceOptionRow {
  readonly id: number;
  readonly profile_id: number;
  readonly name: string;
  readonly emoji: string | null;
  readonly created_at: Date;
  readonly updated_at: Date;
}

export interface RailsSocialStoryRow {
  readonly id: number;
  readonly title: string;
  readonly emoji: string | null;
  readonly position: number | null;
  readonly updated_at: Date;
}

export interface RailsSocialStoryPageRow {
  readonly id: number;
  readonly social_story_id: number;
  readonly position: number;
  readonly caption: string | null;
  readonly emoji: string | null;
  readonly updated_at: Date;
}

export interface RailsInviteRow {
  readonly id: number;
  readonly account_id: number | null;
  readonly email_address: string;
  readonly role: number;
  readonly profile_ids: unknown;
  readonly relationship_label: string | null;
  readonly accepted_at: Date | null;
  readonly archived_at: Date | null;
  readonly expires_at: Date;
}
