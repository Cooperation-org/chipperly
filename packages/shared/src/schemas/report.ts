import { z } from 'zod';
import { uuidSchema } from './common.js';

/** Query for GET /profiles/:pid/report and GET /accounts/:id/report. */
export const ReportQuerySchema = z.object({
  days: z.enum(['7', '30']).default('7').transform(Number),
  format: z.enum(['json', 'csv']).default('json'),
  /** Minutes behind UTC, as `new Date().getTimezoneOffset()`: lets "today" and chip days match the person's clock. */
  tz_offset: z.coerce.number().int().min(-840).max(840).default(0),
});
export type ReportQuery = z.input<typeof ReportQuerySchema>;

export const AccountReportQuerySchema = ReportQuerySchema.extend({ cluster_id: uuidSchema.optional() });

/** Feelings 1..5 counted for one day: index 0 is feeling 1. */
export type FeelingCounts = [number, number, number, number, number];

export interface ProfileReportDay {
  date: string;
  tasks_done: number;
  tasks_planned: number;
  chips_earned: number;
  chips_spent: number;
  feelings: FeelingCounts;
}

export interface ReportNote {
  date: string;
  author: string;
  text: string;
}

export interface ProfileReport {
  profile_id: string;
  name: string;
  from: string;
  to: string;
  days: ProfileReportDay[];
  notes: ReportNote[];
}

export interface AccountReportPerson {
  profile_id: string;
  name: string;
  cluster_id: string | null;
  group: string | null;
  tasks_done: number;
  chips_earned: number;
  /** ms epoch of the last completion ever, null when none. */
  last_active: number | null;
}

export interface AccountReport {
  from: string;
  to: string;
  people_total: number;
  /** People with at least one completion that day. */
  active_per_day: { date: string; active_people: number }[];
  people: AccountReportPerson[];
  /** Completions recorded by each account member in the window (schedule_items.completed_by). */
  staff: { user_id: string; display_name: string; role: string; completions: number }[];
}

const FORMULA_START = /^[=+\-@\t\r]/;

/** One CSV cell: quoted when it holds a comma, quote or newline; text starting like a formula gets a leading apostrophe. */
export function csvCell(value: string | number | null): string {
  if (value === null) return '';
  let s = String(value);
  if (typeof value === 'string' && FORMULA_START.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const csvRow = (cells: (string | number | null)[]): string => cells.map(csvCell).join(',');

export function profileReportToCsv(r: ProfileReport): string {
  const lines = [csvRow(['date', 'tasks_done', 'tasks_planned', 'chips_earned', 'chips_spent', 'feeling_1', 'feeling_2', 'feeling_3', 'feeling_4', 'feeling_5'])];
  for (const d of r.days) lines.push(csvRow([d.date, d.tasks_done, d.tasks_planned, d.chips_earned, d.chips_spent, ...d.feelings]));
  lines.push('', csvRow(['date', 'author', 'note']));
  for (const n of r.notes) lines.push(csvRow([n.date, n.author, n.text]));
  return lines.join('\r\n') + '\r\n';
}

export function accountReportToCsv(r: AccountReport): string {
  const lines = [csvRow(['name', 'group', 'tasks_done', 'chips_earned', 'last_active'])];
  for (const p of r.people) lines.push(csvRow([p.name, p.group, p.tasks_done, p.chips_earned, p.last_active === null ? null : new Date(p.last_active).toISOString()]));
  lines.push('', csvRow(['date', 'active_people']));
  for (const d of r.active_per_day) lines.push(csvRow([d.date, d.active_people]));
  lines.push('', csvRow(['staff', 'role', 'completions']));
  for (const s of r.staff) lines.push(csvRow([s.display_name, s.role, s.completions]));
  return lines.join('\r\n') + '\r\n';
}
