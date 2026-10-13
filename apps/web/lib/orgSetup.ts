// ponytail: a local copy of the tier list. Swap for ORG_TIERS from @chipperly/shared once it lands.
const TIERS = [
  { max: 25, name: 'Pilot' },
  { max: 100, name: 'Small' },
  { max: 250, name: 'Growth' },
  { max: 500, name: 'Scale' },
  { max: 1000, name: 'Enterprise' },
] as const;

/** The plan line shown under "how many people". Empty until there is a usable number. */
export function suggestedPlanLine(count: number): string {
  if (!Number.isFinite(count) || count < 1) return '';
  const tier = TIERS.find((t) => count <= t.max);
  if (!tier) return 'More than 1,000 is a custom plan. We will talk with you.';
  return `Suggested plan: ${tier.name}, up to ${tier.max.toLocaleString('en-US')} people.`;
}

export const ORG_TYPES = [
  { value: 'aba', label: 'ABA' },
  { value: 'habilitation', label: 'Habilitation' },
  { value: 'respite', label: 'Respite' },
  { value: 'school', label: 'School' },
  { value: 'other', label: 'Other' },
] as const;
export type OrgType = (typeof ORG_TYPES)[number]['value'];

export const ORG_STEP_COUNT = 6;

/** The step a history entry holds, clamped to the real range; anything else is the first step. */
export function stepFromState(state: unknown): number {
  const s = (state as { orgStep?: unknown } | null)?.orgStep;
  return typeof s === 'number' && Number.isInteger(s) && s >= 0 && s < ORG_STEP_COUNT ? s : 0;
}

export function canContinueAbout(name: string, orgType: OrgType | null): boolean {
  return name.trim().length > 0 && orgType !== null;
}

/** The CSV a person fills in and uploads. */
export const CSV_TEMPLATE = 'name,group,parent email\nAva Smith,North site,parent@example.com\nBen Jones,North site,\n';

/**
 * What "Everyone" grants: every group, so people added to a group later are seen too, and by name the people
 * in no group. A group made later is not included.
 */
export function everyoneAccess(people: { profile_id: string; cluster_id: string | null }[], groups: { id: string }[]): { profileIds: string[]; clusterIds: string[] } {
  return { profileIds: people.filter((p) => p.cluster_id === null).map((p) => p.profile_id), clusterIds: groups.map((g) => g.id) };
}

/** Step 6 text. `invites` counts parents, not children: one email goes to each parent and covers all of their children. */
export function familyInvitesLine(invites: number): string {
  if (invites < 1) return 'No family emails yet. You can invite families any time. They are free.';
  const what = invites === 1 ? '1 family invite' : `${invites} family invites`;
  return `We sent ${what}, one email per parent that covers all of their children. Families see the schedule, notes and reports. They are free.`;
}

/** Splits "a@x.org, b@y.org\nc@z.org" into emails, dropping blanks and repeats. */
export function splitEmails(text: string): string[] {
  return Array.from(new Set(text.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean)));
}
