import { describe, expect, it } from 'vitest';
import type { BackupAccountPreview, BackupSummary } from '@chipperly/shared/schemas/backup';
import { accountRestoreSentence, sizeLabel, summaryDifferences, tableLabel } from './backupCopy';

const account = { id: '00000000-0000-7000-8000-000000000001', name: 'The Pixley family', kind: 'household', admins: [], people: [], exists_now: true };
const row = (table: string, missing: number, changed: number, newer: number) => ({ table, in_backup: 10, live: 10, missing, changed, same: 10 - missing - changed, newer });
const preview = (tables: BackupAccountPreview['tables']): BackupAccountPreview => ({
  date: '2026-10-07',
  account,
  tables,
  will_restore: tables.reduce((n, t) => n + t.missing + t.changed, 0),
  items: [],
});

describe('backup screen wording', () => {
  it('names tables in plain words and falls back to the table name', () => {
    expect(tableLabel('activities')).toBe('Routines and activities');
    expect(tableLabel('push_tokens')).toBe('push tokens');
  });

  it('says in numbers what a restore of one account will do', () => {
    expect(accountRestoreSentence(preview([row('rewards', 2, 1, 3)]))).toBe('2 missing rows come back, and 1 changed row goes back to how it was. 3 rows made since then are left alone. Nothing is deleted.');
    expect(accountRestoreSentence(preview([row('rewards', 1, 0, 0)]))).toBe('1 missing row comes back. Nothing is deleted.');
    expect(accountRestoreSentence(preview([row('rewards', 0, 0, 4)]))).toBe('Nothing to restore: everything in this backup is already there, unchanged.');
  });

  it('shows only the tables a whole-database restore would change, biggest first', () => {
    const summary: BackupSummary = {
      date: '2026-10-07',
      tables: [
        { table: 'users', in_backup: 10, live: 16 },
        { table: 'rewards', in_backup: 168, live: 177 },
        { table: 'locations', in_backup: 40, live: 40 },
      ],
      totals: { in_backup: 218, live: 233 },
    };
    expect(summaryDifferences(summary)).toEqual([
      { table: 'rewards', in_backup: 168, live: 177, lost: 9 },
      { table: 'users', in_backup: 10, live: 16, lost: 6 },
    ]);
  });

  it('labels file sizes', () => {
    expect(sizeLabel(204 * 1024)).toBe('204 KB');
    expect(sizeLabel(4.3 * 1024 * 1024)).toBe('4.3 MB');
  });
});
