import type { AccountKind, Role } from '@chipperly/shared/schemas/account';
import type { Recurrence } from '@chipperly/shared/schemas/activity';

/** Rails `Account.enum :account_type, [:individual, :household, :organization]` (app/models/account.rb). */
const ACCOUNT_KIND_BY_TYPE: Record<number, AccountKind> = {
  0: 'individual',
  1: 'household',
  2: 'agency',
};

/** Unrecognized/out-of-range values default to `household`, same as the task's "kind from plan or default household". */
export function mapAccountKind(accountType: number): AccountKind {
  return ACCOUNT_KIND_BY_TYPE[accountType] ?? 'household';
}

/** Rails `AccountMembership.enum :role, [:admin, :care_team_member]`: 0 is admin, anything else is a member. */
export function mapMembershipRole(railsRole: number): Role {
  return railsRole === 0 ? 'admin' : 'member';
}

/** Rails `Invite.enum :role, { admin: 0, tester: 1, user: 2, care_team_member: 3 }`: only `admin` carries admin over. */
export function mapInviteRole(railsRole: number): Role {
  return railsRole === 0 ? 'admin' : 'member';
}

const RECURRENCE_VALUES = new Set<Recurrence>(['daily', 'weekdays', 'weekends', 'weekly']);

/** Rails stores the same four strings we do (`app/models/concerns/recurring.rb`); anything else is dropped. */
export function mapRecurrence(value: string | null): Recurrence | null {
  return value !== null && RECURRENCE_VALUES.has(value as Recurrence) ? (value as Recurrence) : null;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** `recurrence_time` is a Rails "time-only" column, stored as a full UTC timestamp on a dummy date; only the clock part matters. */
export function hhmmFromDate(date: Date | null): string | null {
  if (date === null) return null;
  return `${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}`;
}

/** The postgres driver returns a `date` column as a JS `Date`; our schema wants `YYYY-MM-DD`. */
export function isoDateFromDate(date: Date): string {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

/**
 * `weekly` recurrence means "the day of week it was created on"
 * (`recurs_on?` in recurring.rb: `date.wday == created_at.wday`). Ruby's
 * `wday` and our `recurrence_weekday` use the same convention: 0 = Sunday.
 */
export function weekdayFromDate(date: Date): number {
  return date.getUTCDay();
}

/** `skipped_dates` is a Rails `json` column: a plain array of `YYYY-MM-DD` strings, or absent. */
export function parseSkippedDates(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v));
}

export interface TokenBoardEntry {
  readonly goal: number;
  readonly earned: number;
  readonly reward_id: number | null;
}

/**
 * `token_board_state` is `{ "<location name>": { "goal", "earned", "reward_id" } }`
 * (`Profile#adjust_earned_chips`, `TokenBoardController`). Malformed entries are skipped.
 */
export function parseTokenBoardState(value: unknown): Record<string, TokenBoardEntry> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: Record<string, TokenBoardEntry> = {};
  for (const [name, raw] of Object.entries(value as Record<string, unknown>)) {
    if (raw === null || typeof raw !== 'object') continue;
    const entry = raw as Record<string, unknown>;
    const goal = typeof entry.goal === 'number' ? entry.goal : 5;
    const earned = typeof entry.earned === 'number' ? entry.earned : 0;
    const rewardId = typeof entry.reward_id === 'number' ? entry.reward_id : null;
    result[name] = { goal, earned, reward_id: rewardId };
  }
  return result;
}

export interface FirstThenState {
  readonly activity_id: number | null;
  readonly reward_id: number | null;
}

/** `first_then_state` is `{ "activity_id": <int>, "reward_id": <int> }` (`app/controllers/first_then_controller.rb`). */
export function parseFirstThenState(value: unknown): FirstThenState {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return { activity_id: null, reward_id: null };
  const state = value as Record<string, unknown>;
  return {
    activity_id: typeof state.activity_id === 'number' ? state.activity_id : null,
    reward_id: typeof state.reward_id === 'number' ? state.reward_id : null,
  };
}

/** Rails `Invite.profile_ids` is a `json` array of profile ids (integers). */
export function parseProfileIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is number => typeof v === 'number');
}

export function displayNameFor(user: { first_name: string | null; last_name: string | null; email_address: string }): string {
  const name = [user.first_name, user.last_name].filter((part): part is string => Boolean(part && part.trim())).join(' ');
  return name.length > 0 ? name : user.email_address;
}
