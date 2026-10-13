import { describe, expect, it } from 'vitest';
import type { AdminSyncHealth, AdminSyncRejection } from '@chipperly/shared/schemas/syncHealth';
import { syncVerdict } from './syncVerdict';

const NOW = Date.UTC(2026, 9, 13, 12);
const DAY = 24 * 60 * 60 * 1000;
const empty: AdminSyncHealth = { attention: false, open_rejections: 0, rejections: [], devices: [], orphans: [] };
const refusal = (reason: string): AdminSyncRejection =>
  ({ id: crypto.randomUUID(), reason, resolved_at: null, created_at: NOW }) as unknown as AdminSyncRejection;
const orphan = (age: number) => ({ profile_id: crypto.randomUUID(), profile_name: 'Celia', account_name: 'A family', kind: 'x', count: 3, oldest_at: NOW - age });

describe('syncVerdict', () => {
  it('is calm with nothing open, and with only things that clear by themselves', () => {
    expect(syncVerdict(empty, NOW)).toMatchObject({ tone: 'calm', next: 'Nothing to do.' });
    const arriving = syncVerdict({ ...empty, rejections: [refusal('locked')], orphans: [orphan(DAY)] }, NOW);
    expect(arriving).toMatchObject({ tone: 'calm' });
    expect(arriving.next).toMatch(/^2 things are still arriving/);
  });

  it('asks for a person only when a refusal needs one, and says what to do', () => {
    const v = syncVerdict({ ...empty, attention: true, rejections: [refusal('invalid'), refusal('locked')] }, NOW);
    expect(v).toMatchObject({ tone: 'act', title: '1 change was refused and needs you.' });
  });

  it('points at stuck leftovers when the server says something has waited too long', () => {
    expect(syncVerdict({ ...empty, attention: true, orphans: [orphan(3 * DAY)] }, NOW)).toMatchObject({ tone: 'watch', next: expect.stringMatching(/marked stuck/) });
  });
});
