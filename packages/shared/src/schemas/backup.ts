import { z } from 'zod';
import { msTimestampSchema, uuidSchema } from './common.js';

/** A backup is named by the day it was taken, e.g. 2026-10-07. */
export const BackupDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const BackupFileSchema = z.object({
  date: BackupDateSchema,
  /** When the file was written (ms). */
  taken_at: msTimestampSchema,
  size_bytes: z.number().int().nonnegative(),
});
export type BackupFile = z.infer<typeof BackupFileSchema>;

export const BackupListSchema = z.object({
  /** False when this server keeps no backups (no BACKUP_DIR): the screen says so instead of looking empty. */
  enabled: z.boolean(),
  backups: z.array(BackupFileSchema),
});
export type BackupList = z.infer<typeof BackupListSchema>;

/** Rows per table in the backup and in the live database, for a whole-database restore. */
export const BackupSummarySchema = z.object({
  date: BackupDateSchema,
  tables: z.array(z.object({ table: z.string(), in_backup: z.number().int(), live: z.number().int() })),
  totals: z.object({ in_backup: z.number().int(), live: z.number().int() }),
});
export type BackupSummary = z.infer<typeof BackupSummarySchema>;

export const BackupAccountSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  kind: z.string(),
  /** Emails of the account's admins as they were in the backup. */
  admins: z.array(z.string()),
  people: z.array(z.string()),
  /** False when the account no longer exists in the live database. */
  exists_now: z.boolean(),
});
export type BackupAccount = z.infer<typeof BackupAccountSchema>;

/** What restoring one table of one account would do. */
export const BackupTableDiffSchema = z.object({
  table: z.string(),
  in_backup: z.number().int(),
  live: z.number().int(),
  /** In the backup, and gone or deleted now: these come back. */
  missing: z.number().int(),
  /** In both, and different now: these go back to how they were. */
  changed: z.number().int(),
  same: z.number().int(),
  /** Made after the backup: a restore leaves these alone. */
  newer: z.number().int(),
});
export type BackupTableDiff = z.infer<typeof BackupTableDiffSchema>;

export const BackupItemStatus = z.enum(['missing', 'changed', 'same']);

export const BackupAccountPreviewSchema = z.object({
  date: BackupDateSchema,
  account: BackupAccountSchema,
  tables: z.array(BackupTableDiffSchema),
  /** Rows a restore would write: every `missing` and `changed` row. */
  will_restore: z.number().int(),
  /** The things with names, so the admin can see what is in the backup before bringing it back. */
  items: z.array(z.object({ table: z.string(), person: z.string(), name: z.string(), status: BackupItemStatus })),
});
export type BackupAccountPreview = z.infer<typeof BackupAccountPreviewSchema>;

/** POST .../restore: the account's name typed again. */
export const RestoreAccountBodySchema = z.object({ confirm: z.string() });

export const RestoreAccountResultSchema = z.object({
  restored: z.array(z.object({ table: z.string(), rows: z.number().int() })),
  total: z.number().int(),
  /** The copy of the live database taken just before, in case the restore itself was the mistake. */
  safety_copy: z.string(),
});
export type RestoreAccountResult = z.infer<typeof RestoreAccountResultSchema>;

/** POST /admin/backups/:date/restore-all: the literal words "RESTORE <date>". */
export const RestoreAllBodySchema = z.object({ confirm: z.string() });

export const RestoreStatusSchema = z.object({
  state: z.enum(['idle', 'running', 'done', 'failed']),
  date: BackupDateSchema.nullable(),
  started_at: msTimestampSchema.nullable(),
  finished_at: msTimestampSchema.nullable(),
  message: z.string().nullable(),
});
export type RestoreStatus = z.infer<typeof RestoreStatusSchema>;
