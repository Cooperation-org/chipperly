import type { FastifyInstance, FastifyReply } from 'fastify';
import { and, between, eq, gt, inArray, isNotNull, isNull, lt, max, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { uuidSchema } from '@chipperly/shared/schemas/common';
import {
  AccountReportQuerySchema,
  ReportQuerySchema,
  accountReportToCsv,
  profileReportToCsv,
  type AccountReport,
  type FeelingCounts,
  type ProfileReport,
  type ReportNote,
} from '@chipperly/shared/schemas/report';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { db } from '../db/client.js';
import { account_members, users } from '../db/schema/accounts.js';
import { attitude_checks } from '../db/schema/attitude.js';
import { chip_ledger } from '../db/schema/chips.js';
import { clusters } from '../db/schema/clusters.js';
import { day_events } from '../db/schema/events.js';
import { profiles } from '../db/schema/profiles.js';
import { day_plans, schedule_items, step_completions } from '../db/schema/schedule.js';
import { canAccessProfile, requireUser } from '../plugins/auth.js';
import { AppError } from '../plugins/errors.js';
import { moderatorScope } from '../lib/groupAccess.js';
import { requireMember } from './accounts.js';

const DAY_MS = 86_400_000;
const NOTE_LIMIT = 200;

/** YYYY-MM-DD of an epoch-ms on the viewer's clock (`offset` = minutes behind UTC). */
const localDate = (ms: number, offset: number): string => new Date(ms - offset * 60_000).toISOString().slice(0, 10);

/** The window: `n` dates ending today, oldest first, and its [startMs, endMs) bounds on the viewer's clock. */
function window(n: number, offset: number) {
  const today = localDate(Date.now(), offset);
  const startDate = new Date(Date.parse(`${today}T00:00:00Z`) - (n - 1) * DAY_MS);
  const dates = Array.from({ length: n }, (_, i) => new Date(startDate.getTime() + i * DAY_MS).toISOString().slice(0, 10));
  const startMs = startDate.getTime() + offset * 60_000;
  return { dates, from: dates[0]!, to: today, startMs, endMs: startMs + n * DAY_MS };
}

function sendCsv(reply: FastifyReply, name: string, body: string): string {
  reply.header('content-type', 'text/csv; charset=utf-8');
  reply.header('content-disposition', `attachment; filename="${name}.csv"`);
  return body;
}

/** Who may read an account-wide report, and which profiles (null = all). Admins see everyone, moderators their groups' people. */
export async function accountReportScope(accountId: string, userId: string): Promise<{ profileIds: string[] | null }> {
  const membership = await requireMember(accountId, userId);
  if (membership.role === 'admin') return { profileIds: null };
  if (membership.role === 'moderator') return { profileIds: [...(await moderatorScope(accountId, userId)).profiles] };
  throw new AppError(403, 'forbidden', 'Admin or moderator role required');
}

export default async function reportRoutes(app: FastifyInstance): Promise<void> {
  app.get('/profiles/:pid/report', { preHandler: requireUser }, async (request, reply) => {
    const { pid } = z.object({ pid: uuidSchema }).parse(request.params);
    const q = ReportQuerySchema.parse(request.query);
    if (!(await canAccessProfile(request.user!.id, pid))) throw new AppError(403, 'forbidden', 'Cannot access this profile');
    const [profile] = await db.select({ name: profiles.name }).from(profiles).where(and(eq(profiles.id, pid), isNull(profiles.deleted_at))).limit(1);
    if (!profile) throw new AppError(404, 'not_found', 'Person not found');

    const w = window(q.days, q.tz_offset);
    const live = (t: { profile_id: AnyPgColumn; deleted_at: AnyPgColumn }) => and(eq(t.profile_id, pid), isNull(t.deleted_at));

    const [items, chips, checks, plans, events] = await Promise.all([
      db.select({ date: schedule_items.date, done: isNotNull(schedule_items.completed_at) }).from(schedule_items).where(and(live(schedule_items), between(schedule_items.date, w.from, w.to))),
      db.select({ delta: chip_ledger.delta, created_at: chip_ledger.created_at }).from(chip_ledger).where(and(live(chip_ledger), gt(chip_ledger.created_at, w.startMs - 1), lt(chip_ledger.created_at, w.endMs))),
      db
        .select({ feeling: attitude_checks.feeling, note: attitude_checks.note, created_at: attitude_checks.created_at, by: attitude_checks.created_by })
        .from(attitude_checks)
        .where(and(live(attitude_checks), gt(attitude_checks.created_at, w.startMs - 1), lt(attitude_checks.created_at, w.endMs))),
      db.select({ date: day_plans.date, note: day_plans.note, by: day_plans.updated_by }).from(day_plans).where(and(live(day_plans), between(day_plans.date, w.from, w.to), ne(day_plans.note, ''))),
      db
        .select({ date: day_events.date, title: day_events.title, note: day_events.note, by: day_events.updated_by })
        .from(day_events)
        .where(and(live(day_events), between(day_events.date, w.from, w.to), isNotNull(day_events.note), ne(day_events.note, ''))),
    ]);

    const days = new Map(w.dates.map((date) => [date, { date, tasks_done: 0, tasks_planned: 0, chips_earned: 0, chips_spent: 0, feelings: [0, 0, 0, 0, 0] as FeelingCounts }]));
    for (const i of items) {
      const d = days.get(i.date);
      if (!d) continue;
      d.tasks_planned++;
      if (i.done) d.tasks_done++;
    }
    for (const c of chips) {
      const d = days.get(localDate(c.created_at, q.tz_offset));
      if (!d) continue;
      if (c.delta > 0) d.chips_earned += c.delta;
      else d.chips_spent -= c.delta;
    }
    const raw: { date: string; text: string; by: string }[] = [];
    for (const c of checks) {
      const date = localDate(c.created_at, q.tz_offset);
      if (c.feeling !== null && c.feeling >= 1 && c.feeling <= 5) days.get(date)!.feelings[c.feeling - 1]!++;
      if (c.note?.trim()) raw.push({ date, text: c.note.trim(), by: c.by });
    }
    for (const p of plans) raw.push({ date: p.date, text: p.note, by: p.by });
    for (const e of events) raw.push({ date: e.date, text: `${e.title}: ${e.note}`, by: e.by });

    const authorIds = [...new Set(raw.map((n) => n.by))];
    const names = new Map(
      authorIds.length ? (await db.select({ id: users.id, name: users.display_name }).from(users).where(inArray(users.id, authorIds))).map((u) => [u.id, u.name]) : [],
    );
    const notes: ReportNote[] = raw
      .map((n) => ({ date: n.date, author: names.get(n.by) ?? 'Someone', text: n.text }))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, NOTE_LIMIT);

    const report: ProfileReport = { profile_id: pid, name: profile.name, from: w.from, to: w.to, days: [...days.values()], notes };
    return q.format === 'csv' ? sendCsv(reply, `report-${w.to}`, profileReportToCsv(report)) : report;
  });

  app.get('/accounts/:id/report', { preHandler: requireUser }, async (request, reply) => {
    const { id: accountId } = z.object({ id: uuidSchema }).parse(request.params);
    const q = AccountReportQuerySchema.parse(request.query);
    const scope = await accountReportScope(accountId, request.user!.id);

    const w = window(q.days, q.tz_offset);
    const clusterFilter = q.cluster_id ? eq(profiles.cluster_id, q.cluster_id) : undefined;
    const scopeFilter = scope.profileIds ? inArray(profiles.id, scope.profileIds.length ? scope.profileIds : ['00000000-0000-0000-0000-000000000000']) : undefined;
    const people = await db
      .select({ id: profiles.id, name: profiles.name, cluster_id: profiles.cluster_id })
      .from(profiles)
      .where(and(eq(profiles.account_id, accountId), isNull(profiles.deleted_at), isNull(profiles.archived_at), clusterFilter, scopeFilter))
      .orderBy(sql`lower(${profiles.name})`, profiles.id);
    const ids = people.map((p) => p.id);

    const groupNames = new Map((await db.select({ id: clusters.id, name: clusters.name }).from(clusters).where(eq(clusters.account_id, accountId))).map((c) => [c.id, c.name]));
    const done = new Map<string, number>();
    const earned = new Map<string, number>();
    const lastActive = new Map<string, number>();
    const activeByDay = new Map<string, Set<string>>();
    const byStaff = new Map<string, number>();
    const markActive = (profileId: string, ms: number) => {
      const date = localDate(ms, q.tz_offset);
      const set = activeByDay.get(date) ?? new Set<string>();
      set.add(profileId);
      activeByDay.set(date, set);
    };

    if (ids.length) {
      const inWindow = and(isNull(schedule_items.deleted_at), isNotNull(schedule_items.completed_at), gt(schedule_items.completed_at, w.startMs - 1), lt(schedule_items.completed_at, w.endMs));
      const [completions, steps, ledger, lasts, lastSteps] = await Promise.all([
        db.select({ pid: schedule_items.profile_id, at: schedule_items.completed_at, by: schedule_items.completed_by }).from(schedule_items).where(and(inArray(schedule_items.profile_id, ids), inWindow)),
        db
          .select({ pid: step_completions.profile_id, at: step_completions.completed_at })
          .from(step_completions)
          .where(and(inArray(step_completions.profile_id, ids), isNull(step_completions.deleted_at), gt(step_completions.completed_at, w.startMs - 1), lt(step_completions.completed_at, w.endMs))),
        db
          .select({ pid: chip_ledger.profile_id, total: sql<number>`sum(${chip_ledger.delta})::int` })
          .from(chip_ledger)
          .where(and(inArray(chip_ledger.profile_id, ids), isNull(chip_ledger.deleted_at), gt(chip_ledger.delta, 0), gt(chip_ledger.created_at, w.startMs - 1), lt(chip_ledger.created_at, w.endMs)))
          .groupBy(chip_ledger.profile_id),
        db.select({ pid: schedule_items.profile_id, at: max(schedule_items.completed_at) }).from(schedule_items).where(and(inArray(schedule_items.profile_id, ids), isNull(schedule_items.deleted_at))).groupBy(schedule_items.profile_id),
        db.select({ pid: step_completions.profile_id, at: max(step_completions.completed_at) }).from(step_completions).where(and(inArray(step_completions.profile_id, ids), isNull(step_completions.deleted_at))).groupBy(step_completions.profile_id),
      ]);
      for (const c of completions) {
        done.set(c.pid, (done.get(c.pid) ?? 0) + 1);
        markActive(c.pid, c.at!);
        if (c.by) byStaff.set(c.by, (byStaff.get(c.by) ?? 0) + 1);
      }
      for (const s of steps) markActive(s.pid, s.at);
      for (const l of ledger) earned.set(l.pid, l.total);
      for (const l of [...lasts, ...lastSteps]) if (l.at !== null) lastActive.set(l.pid, Math.max(lastActive.get(l.pid) ?? 0, l.at));
    }

    const members = await db
      .select({ user_id: account_members.user_id, role: account_members.role, display_name: users.display_name })
      .from(account_members)
      .innerJoin(users, eq(users.id, account_members.user_id))
      .where(eq(account_members.account_id, accountId));

    const report: AccountReport = {
      from: w.from,
      to: w.to,
      people_total: people.length,
      active_per_day: w.dates.map((date) => ({ date, active_people: activeByDay.get(date)?.size ?? 0 })),
      people: people.map((p) => ({
        profile_id: p.id,
        name: p.name,
        cluster_id: p.cluster_id,
        group: p.cluster_id ? (groupNames.get(p.cluster_id) ?? null) : null,
        tasks_done: done.get(p.id) ?? 0,
        chips_earned: earned.get(p.id) ?? 0,
        last_active: lastActive.get(p.id) ?? null,
      })),
      staff: members
        .filter((m) => m.role !== 'viewer')
        .map((m) => ({ user_id: m.user_id, display_name: m.display_name, role: m.role, completions: byStaff.get(m.user_id) ?? 0 }))
        .sort((a, b) => b.completions - a.completions || a.display_name.localeCompare(b.display_name)),
    };
    return q.format === 'csv' ? sendCsv(reply, `people-report-${w.to}`, accountReportToCsv(report)) : report;
  });
}
