import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { v7 as uuidv7 } from 'uuid';
import { eq } from 'drizzle-orm';
import { buildTestApp, request } from './helpers.js';
import { db } from '../src/db/client.js';
import { account_members, users } from '../src/db/schema/accounts.js';
import { activities } from '../src/db/schema/activities.js';
import { rewards } from '../src/db/schema/rewards.js';
import { locations } from '../src/db/schema/locations.js';
import { profile_members } from '../src/db/schema/profiles.js';
import { issueTokens } from '../src/lib/tokens.js';

async function createUser(label: string): Promise<{ id: string; token: string }> {
  const id = uuidv7();
  await db.insert(users).values({
    id,
    email: `${label}-${id}@example.com`,
    display_name: `${label} tester`,
    created_at: Date.now(),
  });
  const tokens = await issueTokens(id);
  return { id, token: tokens.access_token };
}

function auth(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

/** Pulls the invite link out of the console-transport email (RESEND_API_KEY is unset in tests). */
function captureInviteToken(logSpy: ReturnType<typeof vi.spyOn>): string {
  const logged = logSpy.mock.calls.map((call: unknown[]) => call.join(' ')).join('\n');
  const match = logged.match(/token=([^\s&]+)/);
  if (!match) throw new Error(`no invite link found in logged mail:\n${logged}`);
  return match[1]!;
}

describe('accounts routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates an account, seeds a new profile, and enforces the individual profile limit', async () => {
    const admin = await createUser('admin1');

    const createAccountRes = await request(app, {
      method: 'POST',
      url: '/api/accounts',
      headers: auth(admin.token),
      payload: { kind: 'individual', name: 'Solo account' },
    });
    expect(createAccountRes.statusCode).toBe(201);
    const { account, role } = createAccountRes.json() as { account: { id: string; kind: string }; role: string };
    expect(role).toBe('admin');
    expect(account.kind).toBe('individual');

    const createProfileRes = await request(app, {
      method: 'POST',
      url: `/api/accounts/${account.id}/profiles`,
      headers: auth(admin.token),
      payload: { name: 'Sam' },
    });
    expect(createProfileRes.statusCode).toBe(201);
    const profile = createProfileRes.json() as { id: string; name: string; version: number };
    expect(profile.name).toBe('Sam');
    expect(profile.version).toBeGreaterThan(0);

    const seededActivities = await db.select().from(activities).where(eq(activities.profile_id, profile.id));
    const seededRewards = await db.select().from(rewards).where(eq(rewards.profile_id, profile.id));
    const seededLocations = await db.select().from(locations).where(eq(locations.profile_id, profile.id));
    expect(seededActivities).toHaveLength(30);
    expect(seededRewards).toHaveLength(18);
    expect(seededLocations).toHaveLength(2);

    const secondProfileRes = await request(app, {
      method: 'POST',
      url: `/api/accounts/${account.id}/profiles`,
      headers: auth(admin.token),
      payload: { name: 'Second' },
    });
    expect(secondProfileRes.statusCode).toBe(409);
    const body = secondProfileRes.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe('profile_limit');
    expect(body.error.message).toMatch(/1/);
  });

  it('invites, accepts, and scopes a member to only their assigned profile', async () => {
    const admin = await createUser('admin2');
    const member = await createUser('member2');

    const accountRes = await request(app, {
      method: 'POST',
      url: '/api/accounts',
      headers: auth(admin.token),
      payload: { kind: 'household', name: 'The family' },
    });
    const { account } = accountRes.json() as { account: { id: string } };

    const profileARes = await request(app, {
      method: 'POST',
      url: `/api/accounts/${account.id}/profiles`,
      headers: auth(admin.token),
      payload: { name: 'Child A' },
    });
    const profileA = profileARes.json() as { id: string };

    const profileBRes = await request(app, {
      method: 'POST',
      url: `/api/accounts/${account.id}/profiles`,
      headers: auth(admin.token),
      payload: { name: 'Child B' },
    });
    const profileB = profileBRes.json() as { id: string };

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const inviteRes = await request(app, {
      method: 'POST',
      url: `/api/accounts/${account.id}/invites`,
      headers: auth(admin.token),
      payload: { email: 'family-member@example.com', role: 'member', profile_ids: [profileA.id] },
    });
    expect(inviteRes.statusCode).toBe(201);
    const invite = inviteRes.json() as { email: string };
    expect(invite).not.toHaveProperty('token_hash');
    const rawToken = captureInviteToken(logSpy);
    logSpy.mockRestore();

    const detailsRes = await request(app, { method: 'GET', url: `/api/invites/${rawToken}` });
    expect(detailsRes.statusCode).toBe(200);
    const details = detailsRes.json() as { account_name: string; profiles: { id: string }[]; expired: boolean };
    expect(details.account_name).toBe('The family');
    expect(details.expired).toBe(false);
    expect(details.profiles.map((p) => p.id)).toEqual([profileA.id]);

    const unknownRes = await request(app, { method: 'GET', url: '/api/invites/not-a-real-token' });
    expect(unknownRes.statusCode).toBe(404);

    const acceptRes = await request(app, {
      method: 'POST',
      url: `/api/invites/${rawToken}/accept`,
      headers: auth(member.token),
    });
    expect(acceptRes.statusCode).toBe(200);
    const accepted = acceptRes.json() as { account_id: string; profile_ids: string[] };
    expect(accepted.account_id).toBe(account.id);
    expect(accepted.profile_ids).toEqual([profileA.id]);

    // Equivalent to "member sees only assigned profile via /me": /me is owned by another
    // task and is a stub at the time this test runs, so this asserts the same
    // access-control rule through the route this task owns.
    const memberProfilesRes = await request(app, {
      method: 'GET',
      url: `/api/accounts/${account.id}/profiles`,
      headers: auth(member.token),
    });
    expect(memberProfilesRes.statusCode).toBe(200);
    const memberProfiles = memberProfilesRes.json() as { id: string }[];
    expect(memberProfiles.map((p) => p.id)).toEqual([profileA.id]);

    const membersRes = await request(app, {
      method: 'GET',
      url: `/api/accounts/${account.id}/members`,
      headers: auth(admin.token),
    });
    expect(membersRes.statusCode).toBe(200);
    const membersBody = membersRes.json() as {
      members: { user: { id: string }; role: string; profile_ids: string[] }[];
      invites: unknown[];
    };
    const memberRow = membersBody.members.find((m) => m.user.id === member.id);
    expect(memberRow?.role).toBe('member');
    expect(memberRow?.profile_ids).toEqual([profileA.id]);
    expect(membersBody.invites).toHaveLength(0); // accepted, no longer pending

    // Removing a member reassigns rows they're credited with to the caller.
    await db.update(activities).set({ updated_by: member.id }).where(eq(activities.profile_id, profileB.id));

    const removeRes = await request(app, {
      method: 'DELETE',
      url: `/api/accounts/${account.id}/members/${member.id}`,
      headers: auth(admin.token),
    });
    expect(removeRes.statusCode).toBe(200);

    const reassigned = await db.select().from(activities).where(eq(activities.profile_id, profileB.id));
    expect(reassigned.every((a) => a.updated_by === admin.id)).toBe(true);

    const afterRemovalRes = await request(app, {
      method: 'GET',
      url: `/api/accounts/${account.id}/profiles`,
      headers: auth(member.token),
    });
    expect(afterRemovalRes.statusCode).toBe(403);
  });

  it('refuses to remove the last admin', async () => {
    const admin = await createUser('lastadmin');
    const accountRes = await request(app, {
      method: 'POST',
      url: '/api/accounts',
      headers: auth(admin.token),
      payload: { kind: 'agency', name: 'Solo agency' },
    });
    const { account } = accountRes.json() as { account: { id: string } };

    const removeRes = await request(app, {
      method: 'DELETE',
      url: `/api/accounts/${account.id}/members/${admin.id}`,
      headers: auth(admin.token),
    });
    expect(removeRes.statusCode).toBe(409);
  });

  it('persists relationship_label on profile_members, both on assignment and on a label-only patch', async () => {
    const admin = await createUser('label-admin');
    const member = await createUser('label-member');

    const accountRes = await request(app, {
      method: 'POST',
      url: '/api/accounts',
      headers: auth(admin.token),
      payload: { kind: 'household', name: 'Label household' },
    });
    const { account } = accountRes.json() as { account: { id: string } };

    const profileRes = await request(app, {
      method: 'POST',
      url: `/api/accounts/${account.id}/profiles`,
      headers: auth(admin.token),
      payload: { name: 'Kiddo' },
    });
    const profile = profileRes.json() as { id: string };

    await db.insert(account_members).values({ account_id: account.id, user_id: member.id, role: 'member' });

    const assignRes = await request(app, {
      method: 'PATCH',
      url: `/api/accounts/${account.id}/members/${member.id}`,
      headers: auth(admin.token),
      payload: { profile_ids: [profile.id], relationship_label: 'Grandma' },
    });
    expect(assignRes.statusCode).toBe(200);
    const [assigned] = await db.select().from(profile_members).where(eq(profile_members.user_id, member.id));
    expect(assigned?.relationship_label).toBe('Grandma');

    const relabelRes = await request(app, {
      method: 'PATCH',
      url: `/api/accounts/${account.id}/members/${member.id}`,
      headers: auth(admin.token),
      payload: { relationship_label: 'Auntie' },
    });
    expect(relabelRes.statusCode).toBe(200);
    const [relabeled] = await db.select().from(profile_members).where(eq(profile_members.user_id, member.id));
    expect(relabeled?.relationship_label).toBe('Auntie');
  });
});
