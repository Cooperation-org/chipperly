import type { AdminSyncHealth } from '@chipperly/shared/schemas/syncHealth';

/** Refusals the phone clears by itself (mirrors the API's lib/syncHealth.ts). */
export const HELD_REASONS: ReadonlySet<string> = new Set(['locked', 'lapsed']);

/** Leftovers older than this will not fill in by themselves (mirrors the API). */
export const ORPHAN_OLD_MS = 2 * 24 * 60 * 60 * 1000;

export interface SyncVerdict {
  /** act: someone has to do something now; watch: stuck a while, worth a look; calm: nothing to do. */
  tone: 'act' | 'watch' | 'calm';
  title: string;
  next: string;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Pure: the sentence at the top of Sync health. Red only when a person can do something about it. */
export function syncVerdict(health: AdminSyncHealth, now: number): SyncVerdict {
  const needYou = health.rejections.filter((r) => r.resolved_at === null && !HELD_REASONS.has(r.reason)).length;
  if (needYou > 0) {
    return {
      tone: 'act',
      title: `${plural(needYou, 'change was', 'changes were')} refused and need${needYou === 1 ? 's' : ''} you.`,
      next: 'For each one below, choose Save it anyway or Ignore.',
    };
  }
  if (health.attention) {
    const stuck = health.orphans.filter((o) => now - o.oldest_at > ORPHAN_OLD_MS).length;
    return {
      tone: 'watch',
      title: 'Nothing is lost, but something has been stuck for a while.',
      next: stuck > 0 ? 'See the rows marked stuck below and ask that family to open the app.' : 'See the phones below and ask those families to open the app with internet on.',
    };
  }
  const waiting = health.rejections.filter((r) => r.resolved_at === null).length + health.devices.length + health.orphans.length;
  if (waiting > 0) {
    return {
      tone: 'calm',
      title: 'Everything is saved or on its way.',
      next: `${plural(waiting, 'thing is', 'things are')} still arriving from phones. They clear by themselves. Nothing to do.`,
    };
  }
  return { tone: 'calm', title: 'Everything phones have written is saved.', next: 'Nothing to do.' };
}
