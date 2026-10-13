/** Types and pure helpers for the Org home and Groups screens (API contract: GET /accounts/:id/roster, /clusters). */
import { filterByName, sortByName } from '../profile/switcher';

export interface RosterPerson {
  profile_id: string;
  name: string;
  emoji: string | null;
  photo_id: string | null;
  cluster_id: string | null;
  archived_at: number | null;
  team: { user_id: string; display_name: string; role: string }[];
}

export interface RosterResponse {
  people: RosterPerson[];
  seats: { used: number; limit: number | null; over?: boolean };
}

export interface Cluster {
  id: string;
  name: string;
  archived_at: number | null;
  profile_count: number;
  /** Staff, moderators and families assigned to the group. Only sent to admins and moderators. */
  staff?: { user_id: string; display_name: string; role: string }[];
}

export type StatusFilter = 'active' | 'archived' | 'all';

/** Page size for the people list: the list renders this many rows and "Show more" adds another page. */
export const PAGE_SIZE = 100;

export interface RosterFilter {
  q: string;
  /** null = every group; 'none' = people without a group. */
  clusterId: string | null;
  status: StatusFilter;
}

/** Search, group and status filters applied together, sorted by name. */
export function filterRoster(people: RosterPerson[], f: RosterFilter): RosterPerson[] {
  const byStatus = people.filter((p) => (f.status === 'all' ? true : f.status === 'archived' ? p.archived_at !== null : p.archived_at === null));
  const byGroup = byStatus.filter((p) => (f.clusterId === null ? true : f.clusterId === 'none' ? p.cluster_id === null : p.cluster_id === f.clusterId));
  return sortByName(filterByName(byGroup, f.q));
}

export function isOverSeats(seats: { used: number; limit: number | null }): boolean {
  return seats.limit !== null && seats.used > seats.limit;
}

export function seatLabel(seats: { used: number; limit: number | null }): string {
  return seats.limit === null ? `${seats.used} people` : `${seats.used} of ${seats.limit} people`;
}

export const OVER_PLAN_MESSAGE = "You're over your plan. We'll be in touch to update it.";

/** Active groups by name; archived groups never show as filter chips or move targets. */
export function activeClusters(clusters: Cluster[]): Cluster[] {
  return sortByName(clusters.filter((c) => c.archived_at === null));
}

/** Initials for a team avatar: first letters of up to two words. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((w) => Array.from(w)[0]!.toUpperCase()).join('') || '?';
}

/** The org account to show: the active account when it is an org, else the first org the user belongs to. */
export function pickOrgAccount<T extends { account: { id: string; kind: string } }>(accounts: T[], activeAccountId: string | null | undefined): T | undefined {
  const orgs = accounts.filter((a) => a.account.kind === 'agency');
  return orgs.find((a) => a.account.id === activeAccountId) ?? orgs[0];
}

/** Where a caregiver lands: the Org home when they belong to an org, else Today. */
export function homePath(accounts: { account: { kind: string } }[]): string {
  return accounts.some((a) => a.account.kind === 'agency') ? '/org/' : '/today/';
}

/** Who may do what on the Org screens: admins manage everything; members and viewers only see their people. */
export function canManageOrg(role: string | undefined): boolean {
  return role === 'admin';
}

/** Admins and moderators move and archive people (a moderator only inside their own groups, which the server checks). */
export function canMovePeople(role: string | undefined): boolean {
  return role === 'admin' || role === 'moderator';
}

/** Names of the staff on a person's team (everyone but families), for the line under their name. */
export function staffNames(team: RosterPerson['team']): string {
  return team.filter((t) => t.role !== 'viewer').map((t) => t.display_name).join(', ');
}

/** Server error codes turned into plain text. */
export function orgErrorMessage(code: string | undefined): string {
  if (code === 'cluster_not_empty') return 'Move or archive the people in this group first.';
  if (code === 'not_an_org') return 'This account is not an organization.';
  return 'That did not work. Try again.';
}
