import { describe, expect, it } from 'vitest';
import { applyPulledRow } from './applyPulledRow';

interface Row {
  id: string;
  client_updated_at: number;
  value: string;
}

describe('applyPulledRow', () => {
  it('takes incoming when there is no local row', () => {
    const incoming: Row = { id: '1', client_updated_at: 100, value: 'server' };
    expect(applyPulledRow(undefined, incoming, false)).toBe(incoming);
  });

  it('takes incoming when it is newer than local, even with a pending outbox entry', () => {
    const local: Row = { id: '1', client_updated_at: 100, value: 'local' };
    const incoming: Row = { id: '1', client_updated_at: 200, value: 'server' };
    expect(applyPulledRow(local, incoming, true)).toBe(incoming);
  });

  it('takes incoming when local has no pending outbox entry, even if older', () => {
    const local: Row = { id: '1', client_updated_at: 200, value: 'local' };
    const incoming: Row = { id: '1', client_updated_at: 100, value: 'server' };
    expect(applyPulledRow(local, incoming, false)).toBe(incoming);
  });

  it('keeps local when it is newer AND still has a pending outbox entry', () => {
    const local: Row = { id: '1', client_updated_at: 200, value: 'local' };
    const incoming: Row = { id: '1', client_updated_at: 100, value: 'server' };
    expect(applyPulledRow(local, incoming, true)).toBe(local);
  });

  it('takes incoming on a tie', () => {
    const local: Row = { id: '1', client_updated_at: 100, value: 'local' };
    const incoming: Row = { id: '1', client_updated_at: 100, value: 'server' };
    expect(applyPulledRow(local, incoming, true)).toBe(incoming);
  });
});
