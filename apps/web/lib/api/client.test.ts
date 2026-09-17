import { describe, expect, it } from 'vitest';
import { buildHeaders } from './client';

describe('buildHeaders', () => {
  it('omits Content-Type when there is no body', () => {
    const headers = buildHeaders({ hasBody: false });
    expect(headers['Content-Type']).toBeUndefined();
  });

  it('sets Content-Type: application/json when there is a body', () => {
    const headers = buildHeaders({ hasBody: true });
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('adds Authorization, X-Account-Id and X-Locked only when given', () => {
    const bare = buildHeaders({ hasBody: false });
    expect(bare.Authorization).toBeUndefined();
    expect(bare['X-Account-Id']).toBeUndefined();
    expect(bare['X-Locked']).toBeUndefined();

    const full = buildHeaders({ hasBody: true, accessToken: 'tok', accountId: 'acc-1', locked: true });
    expect(full.Authorization).toBe('Bearer tok');
    expect(full['X-Account-Id']).toBe('acc-1');
    expect(full['X-Locked']).toBe('1');
  });
});
