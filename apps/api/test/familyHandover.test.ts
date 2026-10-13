import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { v7 as uuidv7 } from 'uuid';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../src/db/client.js';
import { account_members, accounts, users } from '../src/db/schema/accounts.js';
import { family_handovers } from '../src/db/schema/handovers.js';
import { media } from '../src/db/schema/media.js';
import { profile_members, profiles } from '../src/db/schema/profiles.js';
import { locations } from '../src/db/schema/locations.js';
import { activities, activity_steps, recurrence_skips } from '../src/db/schema/activities.js';
import { rewards } from '../src/db/schema/rewards.js';
import { day_plans, schedule_items, step_completions } from '../src/db/schema/schedule.js';
import { social_stories, story_pages } from '../src/db/schema/stories.js';
import { chip_ledger } from '../src/db/schema/chips.js';
import { mood_events } from '../src/db/schema/mood.js';
import { attitude_checks } from '../src/db/schema/attitude.js';
import { day_events } from '../src/db/schema/events.js';
import { env } from '../src/env.js';
import { getLastMailMessage } from '../src/lib/mailer.js';
import { sendLapsedHandovers } from '../src/lib/familyHandover.js';
import { buildTestApp, request } from './helpers.js';
import { addMember, createAccount, createProfile, createUser } from './fixtures.js';

const auth = (token: string) => ({ authorization: `Bearer ${token}` });
const codeOf = (res: { json: () => unknown }) => (res.json() as { error: { code: string } }).error.code;
const tokenIn = (text: string): string => /token=([\w-]+)/.exec(text)![1]!;

/** Every person-scoped table the copy must carry over. */
const TABLES = { locations, activities, activity_steps, recurrence_skips, rewards, schedule_items, day_plans, step_completions, social_stories, story_pages, chip_ledger, mood_events, attitude_checks, day_events };

describe('family keeps a copy', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  const get = (token: string, url: string) => request(app, { method: 'GET', url, headers: auth(token) });
  const post = (token: string, url: string) => request(app, { method: 'POST', url, headers: auth(token) });
  const patch = (token: string, url: string, payload: object) => request(app, { method: 'PATCH', url, headers: auth(token), payload });
  const del = (token: string, url: string) => request(app, { method: 'DELETE', url, headers: auth(token) });

  /** Mails go out in email order (ids ascend), so the family's is the last one sent for Ava.
   An org with Ava (fully seeded), her family viewer, a parent-labelled staff member, and unrelated people. */
  async function setup() {
    const admin = await createUser('Olga Owner');
    const accountId = await createAccount(admin.id, 'agency', 'Bright Steps');
    await addMember(accountId, admin.id, 'admin');
    const ava = await createProfile(accountId, admin.id, 'Ava');
    const ben = await createProfile(accountId, admin.id, 'Ben');
    const parentStaff = await createUser('Pam Parentstaff');
    await addMember(accountId, parentStaff.id, 'member');
    await db.insert(profile_members).values({ profile_id: ava, user_id: parentStaff.id, relationship_label: 'Parent' });
    const family = await createUser('Pat Parent');
    await addMember(accountId, family.id, 'viewer');
    await db.insert(profile_members).values({ profile_id: ava, user_id: family.id, relationship_label: null });
    const staff = await createUser('Sam Staff');
    await addMember(accountId, staff.id, 'member');
    await db.insert(profile_members).values({ profile_id: ava, user_id: staff.id, relationship_label: 'Therapist' });
    const bensFamily = await createUser('Bea Parent');
    await addMember(accountId, bensFamily.id, 'viewer');
    await db.insert(profile_members).values({ profile_id: ben, user_id: bensFamily.id, relationship_label: null });
    await seed(accountId, ava, admin.id);
    return { admin, accountId, ava, ben, family, parentStaff, staff, bensFamily };
  }

  async function seed(accountId: string, pid: string, by: string) {
    // Typed loosely on purpose: one helper fills the sync columns for fourteen different tables.
    const sync = (over: Record<string, unknown> = {}): never => ({ id: uuidv7(), profile_id: pid, client_updated_at: 1, updated_by: by, deleted_at: null, ...over }) as never;
    const mediaRow = async () => {
      const id = uuidv7();
      await db.insert(media).values({ id, account_id: accountId, kind: 'image', status: 'ready', storage_key: `k/${id}`, content_type: 'image/jpeg', width: 1, height: 1, duration_ms: null, bytes: 1, original_bytes: 1, created_by: by, created_at: 1 });
      return id;
    };
    const photo = await mediaRow();
    const audio = await mediaRow();
    const loc = uuidv7();
    const act = uuidv7();
    const step = uuidv7();
    const rew = uuidv7();
    const item = uuidv7();
    const story = uuidv7();
    await db.update(profiles).set({ avatar_photo_id: photo, first_then_activity_id: act, first_then_reward_id: rew, settings: { read_aloud: true, first_then_first_audio_id: audio, day_goal_reward_id: rew } }).where(eq(profiles.id, pid));
    await db.insert(locations).values(sync({ id: loc, name: 'Home', position: 0, photo_id: photo, working_for_reward_id: rew }));
    await db.insert(activities).values(sync({ id: act, name: 'Brush teeth', position: 0, chip_value: 3, location_ids: [loc], photo_id: photo, goal_reward_id: rew }));
    await db.insert(activity_steps).values(sync({ id: step, activity_id: act, position: 0, name: 'Paste' }));
    await db.insert(activity_steps).values(sync({ activity_id: act, parent_step_id: step, position: 1, name: 'Squeeze' }));
    await db.insert(recurrence_skips).values(sync({ activity_id: act, date: '2026-10-01' }));
    await db.insert(rewards).values(sync({ id: rew, name: 'Park', position: 2, chip_cost: 5, location_ids: [loc], positions: { [loc]: 4, all: 1 }, requires_activity_id: act }));
    await db.insert(schedule_items).values(sync({ id: item, date: '2026-10-02', position: 0, activity_id: act, source: 'manual', completed_at: 5, completed_by: by, story_id: story }));
    await db.insert(day_plans).values(sync({ date: '2026-10-02', note: 'Dentist day', photo_id: photo }));
    await db.insert(step_completions).values(sync({ schedule_item_id: item, activity_step_id: step, completed_at: 6, completed_by: by }));
    await db.insert(social_stories).values(sync({ id: story, title: 'The dentist', position: 0, cover_photo_id: photo }));
    await db.insert(story_pages).values(sync({ story_id: story, position: 0, text: 'We sit down', audio_id: audio, photo_id: photo }));
    await db.insert(chip_ledger).values([sync({ location_id: loc, delta: 7, reason: 'activity', ref_id: act, created_at: 7, created_by: by }), sync({ delta: -2, reason: 'redeem', ref_id: rew, created_at: 8, created_by: by })]);
    await db.insert(mood_events).values(sync({ date: '2026-10-02', delta: 1, level_after: 3, created_at: 9, created_by: by }));
    await db.insert(attitude_checks).values(sync({ schedule_item_id: item, value: 'good', feeling: 4, kind: 'checkup', note: 'Calm today', created_at: 10, created_by: by }));
    await db.insert(day_events).values(sync({ title: 'Doctor', date: '2026-10-05', story_id: story, photo_id: photo }));
  }

  async function counts(pid: string) {
    const out: Record<string, number> = {};
    for (const [name, t] of Object.entries(TABLES)) out[name] = (await db.select({ id: t.id }).from(t).where(eq(t.profile_id, pid))).length;
    return out;
  }

  /** Archives Ava as the org admin and returns the token from the family's email. */
  async function archiveAva(s: Awaited<ReturnType<typeof setup>>) {
    const res = await patch(s.admin.token, `/api/accounts/${s.accountId}/profiles/${s.ava}`, { archived: true });
    expect(res.statusCode).toBe(200);
    return tokenIn(getLastMailMessage()!.text);
  }

  describe('the copy', () => {
    it('copies a seeded person into a new supported account with new ids, and leaves the org copy alone', async () => {
      const s = await setup();
      const before = await counts(s.ava);
      expect(Object.values(before).every((n) => n > 0)).toBe(true);
      const token = await archiveAva(s);

      const accept = await post(s.family.token, `/api/handovers/${token}/accept`);
      expect(accept.statusCode).toBe(201);
      const { account_id, profile_id } = accept.json() as { account_id: string; profile_id: string };

      const [account] = await db.select().from(accounts).where(eq(accounts.id, account_id));
      expect(account).toMatchObject({ kind: 'supported', owner_user_id: s.family.id });
      const [member] = await db.select().from(account_members).where(and(eq(account_members.account_id, account_id), eq(account_members.user_id, s.family.id)));
      expect(member?.role).toBe('admin');

      // Same rows in every table, none of them the same ids.
      expect(await counts(profile_id)).toEqual(before);
      expect(await counts(s.ava)).toEqual(before);
      for (const t of Object.values(TABLES)) {
        const oldIds = new Set((await db.select({ id: t.id }).from(t).where(eq(t.profile_id, s.ava))).map((r) => r.id));
        const fresh = await db.select({ id: t.id, by: t.updated_by }).from(t).where(eq(t.profile_id, profile_id));
        expect(fresh.every((r) => !oldIds.has(r.id) && r.by === s.family.id)).toBe(true);
      }

      const [copy] = await db.select().from(profiles).where(eq(profiles.id, profile_id));
      expect(copy).toMatchObject({ account_id, name: 'Ava', share_token: null, cluster_id: null, archived_at: null });
      const [orig] = await db.select().from(profiles).where(eq(profiles.id, s.ava));
      expect(orig?.account_id).toBe(s.accountId);
      expect(orig?.archived_at).not.toBeNull();

      // References point inside the copy.
      const [newAct] = await db.select().from(activities).where(eq(activities.profile_id, profile_id));
      const [newLoc] = await db.select().from(locations).where(eq(locations.profile_id, profile_id));
      const [newRew] = await db.select().from(rewards).where(eq(rewards.profile_id, profile_id));
      expect(copy!.first_then_activity_id).toBe(newAct!.id);
      expect(copy!.first_then_reward_id).toBe(newRew!.id);
      expect(newAct!.location_ids).toEqual([newLoc!.id]);
      expect(newAct!.goal_reward_id).toBe(newRew!.id);
      expect(newLoc!.working_for_reward_id).toBe(newRew!.id);
      expect(newRew!.requires_activity_id).toBe(newAct!.id);
      expect(newRew!.positions).toEqual({ [newLoc!.id]: 4, all: 1 });
      expect(copy!.settings).toMatchObject({ read_aloud: true, day_goal_reward_id: newRew!.id });
      const steps = await db.select().from(activity_steps).where(eq(activity_steps.profile_id, profile_id));
      expect(steps.every((st) => st.activity_id === newAct!.id)).toBe(true);
      expect(steps.find((st) => st.parent_step_id)?.parent_step_id).toBe(steps.find((st) => !st.parent_step_id)!.id);
      const [newItem] = await db.select().from(schedule_items).where(eq(schedule_items.profile_id, profile_id));
      const [newStory] = await db.select().from(social_stories).where(eq(social_stories.profile_id, profile_id));
      expect(newItem).toMatchObject({ activity_id: newAct!.id, story_id: newStory!.id, completed_by: s.family.id });
      const [comp] = await db.select().from(step_completions).where(eq(step_completions.profile_id, profile_id));
      expect(comp!.schedule_item_id).toBe(newItem!.id);
      expect(steps.map((st) => st.id)).toContain(comp!.activity_step_id);
      const [page] = await db.select().from(story_pages).where(eq(story_pages.profile_id, profile_id));
      expect(page!.story_id).toBe(newStory!.id);
      const [note] = await db.select().from(attitude_checks).where(eq(attitude_checks.profile_id, profile_id));
      expect(note).toMatchObject({ note: 'Calm today', feeling: 4, schedule_item_id: newItem!.id });

      // Chip balance carries over.
      const balance = async (pid: string) => (await db.select({ d: chip_ledger.delta }).from(chip_ledger).where(eq(chip_ledger.profile_id, pid))).reduce((a, r) => a + r.d, 0);
      expect(await balance(profile_id)).toBe(5);

      // Pictures: own media rows in the new account, same stored files, so they still load.
      const mediaIds = [copy!.avatar_photo_id, newLoc!.photo_id, newAct!.photo_id, page!.photo_id, page!.audio_id, (copy!.settings as { first_then_first_audio_id: string }).first_then_first_audio_id];
      expect(mediaIds.every((m) => m)).toBe(true);
      const copiedMedia = await db.select().from(media).where(inArray(media.id, mediaIds as string[]));
      expect(copiedMedia.length).toBe(2);
      expect(copiedMedia.every((m) => m.account_id === account_id)).toBe(true);
      const orgMedia = await db.select().from(media).where(eq(media.account_id, s.accountId));
      expect(copiedMedia.map((m) => m.storage_key).sort()).toEqual(orgMedia.map((m) => m.storage_key).sort());

      // The family can read their new person; they get a normal trial.
      const me = await get(s.family.token, `/api/accounts/${account_id}/profiles`);
      expect(me.statusCode).toBe(200);
      const [person] = await db.select().from(users).where(eq(users.id, s.family.id));
      expect(person!.created_at).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('who may use a link', () => {
    it('refuses a used token, an expired token, and anyone not linked to the person', async () => {
      const s = await setup();
      const token = await archiveAva(s);

      // Not the linked user: unrelated staff, another family, the org admin.
      for (const stranger of [s.staff, s.bensFamily, s.admin]) {
        const res = await post(stranger.token, `/api/handovers/${token}/accept`);
        expect(res.statusCode).toBe(404);
        expect((await get(stranger.token, `/api/handovers/${token}`)).statusCode).toBe(404);
      }
      expect((await post(s.family.token, '/api/handovers/not-a-real-token/accept')).statusCode).toBe(404);

      const first = await post(s.family.token, `/api/handovers/${token}/accept`);
      expect(first.statusCode).toBe(201);
      const again = await post(s.family.token, `/api/handovers/${token}/accept`);
      expect(again.statusCode).toBe(410);
      expect(codeOf(again)).toBe('handover_used');
      // Only one copy came out of it.
      const copies = await db.select().from(profiles).where(eq(profiles.name, 'Ava'));
      expect(copies.filter((p) => p.account_id !== s.accountId && p.updated_by === s.family.id)).toHaveLength(1);

      // Expired: the parent-labelled staff member's own link, aged out.
      await db.update(family_handovers).set({ expires_at: Date.now() - 1 }).where(and(eq(family_handovers.user_id, s.parentStaff.id), eq(family_handovers.profile_id, s.ava)));
      const [row] = await db.select().from(family_handovers).where(and(eq(family_handovers.user_id, s.parentStaff.id), eq(family_handovers.profile_id, s.ava)));
      const expired = await post(s.parentStaff.token, `/api/handovers/${row!.id}/accept`);
      expect(expired.statusCode).toBe(410);
      expect(codeOf(expired)).toBe('handover_expired');
    });

    it('stores only a hash of the token', async () => {
      const s = await setup();
      const token = await archiveAva(s);
      const rows = await db.select().from(family_handovers).where(eq(family_handovers.profile_id, s.ava));
      expect(rows.some((r) => r.token_hash === token)).toBe(false);
      expect(rows.every((r) => r.expires_at - r.created_at === 30 * 24 * 60 * 60 * 1000)).toBe(true);
    });

    it('stops working once the organization covers the person again', async () => {
      const s = await setup();
      const token = await archiveAva(s);
      await patch(s.admin.token, `/api/accounts/${s.accountId}/profiles/${s.ava}`, { archived: false });
      const res = await post(s.family.token, `/api/handovers/${token}/accept`);
      expect(res.statusCode).toBe(409);
      expect(codeOf(res)).toBe('handover_inactive');
      expect(((await get(s.family.token, '/api/me/handovers')).json() as { handovers: unknown[] }).handovers).toEqual([]);
    });
  });

  describe('triggers', () => {
    it('archiving emails every Family and parent-labelled Staff once, nobody else, and not again on a repeat', async () => {
      const s = await setup();
      await archiveAva(s);
      const rows = await db.select().from(family_handovers).where(eq(family_handovers.profile_id, s.ava));
      expect(rows.map((r) => r.user_id).sort()).toEqual([s.family.id, s.parentStaff.id].sort());
      expect(rows.every((r) => r.reason === 'archived' && r.used_at === null)).toBe(true);
      const mail = getLastMailMessage()!;
      expect(mail.subject).toBe("Keep Ava's Chipperly");
      expect(mail.text).toContain('Bright Steps no longer covers Ava');
      expect(mail.text).not.toContain('—');

      // Archive, restore, archive again: still one offer per person and trigger.
      await patch(s.admin.token, `/api/accounts/${s.accountId}/profiles/${s.ava}`, { archived: false });
      await patch(s.admin.token, `/api/accounts/${s.accountId}/profiles/${s.ava}`, { archived: true });
      expect(await db.select().from(family_handovers).where(eq(family_handovers.profile_id, s.ava))).toHaveLength(2);
    });

    it('removing a family member emails them for each person they were linked to', async () => {
      const s = await setup();
      const res = await del(s.admin.token, `/api/accounts/${s.accountId}/members/${s.family.id}`);
      expect(res.statusCode).toBe(200);
      const rows = await db.select().from(family_handovers).where(eq(family_handovers.user_id, s.family.id));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ profile_id: s.ava, reason: 'removed' });
      const token = tokenIn(getLastMailMessage()!.text);

      // No longer a member of the org, still able to keep the copy.
      const accept = await post(s.family.token, `/api/handovers/${token}/accept`);
      expect(accept.statusCode).toBe(201);
    });

    it('removing staff who are not parents sends nothing', async () => {
      const s = await setup();
      await del(s.admin.token, `/api/accounts/${s.accountId}/members/${s.staff.id}`);
      expect(await db.select().from(family_handovers).where(eq(family_handovers.user_id, s.staff.id))).toHaveLength(0);
    });

    it('does nothing for a household', async () => {
      const admin = await createUser();
      const accountId = await createAccount(admin.id, 'household');
      await addMember(accountId, admin.id, 'admin');
      const kid = await createProfile(accountId, admin.id, 'Kid');
      const viewer = await createUser('Gran');
      await addMember(accountId, viewer.id, 'viewer');
      await db.insert(profile_members).values({ profile_id: kid, user_id: viewer.id, relationship_label: null });
      await del(admin.token, `/api/accounts/${accountId}/members/${viewer.id}`);
      expect(await db.select().from(family_handovers).where(eq(family_handovers.user_id, viewer.id))).toHaveLength(0);
    });

    it('the daily check offers a copy once the organization access has lapsed, and only then', async () => {
      const s = await setup();
      const mutable = env as { stripeEnabled: boolean };
      const was = mutable.stripeEnabled;
      mutable.stripeEnabled = true;
      try {
        // Inside the trial: nothing.
        expect(await sendLapsedHandovers()).toBe(0);
        // Trial and grace long over.
        await db.update(users).set({ created_at: Date.now() - 90 * 24 * 60 * 60 * 1000 }).where(eq(users.id, s.admin.id));
        const sent = await sendLapsedHandovers();
        expect(sent).toBeGreaterThanOrEqual(3);
        const rows = await db.select().from(family_handovers).where(and(eq(family_handovers.profile_id, s.ava), eq(family_handovers.reason, 'lapsed')));
        expect(rows.map((r) => r.user_id).sort()).toEqual([s.family.id, s.parentStaff.id].sort());
        const benRows = await db.select().from(family_handovers).where(eq(family_handovers.user_id, s.bensFamily.id));
        expect(benRows).toHaveLength(1);
        // Sent once per person per trigger.
        await sendLapsedHandovers();
        expect(await db.select().from(family_handovers).where(and(eq(family_handovers.profile_id, s.ava), eq(family_handovers.reason, 'lapsed')))).toHaveLength(2);

        // The banner lists it, and accepting works while it still lapsed.
        const banner = (await get(s.family.token, '/api/me/handovers')).json() as { handovers: { id: string; profile_name: string; org_name: string; reason: string }[] };
        expect(banner.handovers).toHaveLength(1);
        expect(banner.handovers[0]).toMatchObject({ profile_name: 'Ava', org_name: 'Bright Steps', reason: 'lapsed' });
        const accept = await post(s.family.token, `/api/handovers/${banner.handovers[0]!.id}/accept`);
        expect(accept.statusCode).toBe(201);
        expect(((await get(s.family.token, '/api/me/handovers')).json() as { handovers: unknown[] }).handovers).toEqual([]);
      } finally {
        mutable.stripeEnabled = was;
      }
    });
  });
});
