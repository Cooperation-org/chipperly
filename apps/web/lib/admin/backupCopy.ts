import type { BackupAccountPreview, BackupSummary } from '@chipperly/shared/schemas/backup';

/** Plain names for the tables a super admin sees on the backup screen. Anything else shows its own name. */
const TABLE_LABELS: Record<string, string> = {
  profiles: 'People',
  locations: 'Places',
  activities: 'Routines and activities',
  activity_steps: 'Steps',
  recurrence_skips: 'Skipped days',
  rewards: 'Rewards',
  schedule_items: 'Schedule entries',
  step_completions: 'Steps ticked',
  chip_ledger: 'Chips earned and spent',
  social_stories: 'Stories',
  story_pages: 'Story pages',
  attitude_checks: 'Chipper Chart entries',
  mood_events: 'Feelings',
  day_plans: 'Day plans',
  day_events: 'Events',
  users: 'Sign-ins',
  accounts: 'Accounts',
  account_members: 'Account members',
};

export function tableLabel(table: string): string {
  return TABLE_LABELS[table] ?? table.replace(/_/g, ' ');
}

export function sizeLabel(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** The one sentence above the restore button: what will happen, in numbers. */
export function accountRestoreSentence(preview: BackupAccountPreview): string {
  const missing = preview.tables.reduce((n, t) => n + t.missing, 0);
  const changed = preview.tables.reduce((n, t) => n + t.changed, 0);
  const newer = preview.tables.reduce((n, t) => n + t.newer, 0);
  if (preview.will_restore === 0) return 'Nothing to restore: everything in this backup is already there, unchanged.';
  const parts = [missing > 0 ? `${missing} missing ${missing === 1 ? 'row comes' : 'rows come'} back` : '', changed > 0 ? `${changed} changed ${changed === 1 ? 'row goes' : 'rows go'} back to how ${changed === 1 ? 'it was' : 'they were'}` : ''].filter(Boolean);
  const kept = newer > 0 ? ` ${newer} ${newer === 1 ? 'row' : 'rows'} made since then ${newer === 1 ? 'is' : 'are'} left alone.` : '';
  return `${parts.join(', and ')}.${kept} Nothing is deleted.`;
}

/** Tables worth showing: the ones where the backup and the live database differ, biggest difference first. */
export function summaryDifferences(summary: BackupSummary): { table: string; in_backup: number; live: number; lost: number }[] {
  return summary.tables
    .map((t) => ({ ...t, lost: t.live - t.in_backup }))
    .filter((t) => t.lost !== 0)
    .sort((a, b) => Math.abs(b.lost) - Math.abs(a.lost));
}
