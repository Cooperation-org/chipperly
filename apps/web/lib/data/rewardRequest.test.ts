import { beforeEach, describe, expect, it, vi } from 'vitest';

const { kv, post } = vi.hoisted(() => ({ kv: new Map<string, unknown>(), post: vi.fn() }));
vi.mock('../db/kv', () => ({
  getKv: vi.fn((key: string) => Promise.resolve(kv.get(key))),
  setKv: vi.fn((key: string, value: unknown) => {
    kv.set(key, value);
    return Promise.resolve();
  }),
}));
vi.mock('../device/identity', () => ({ getDeviceId: () => Promise.resolve('device-1') }));
vi.mock('../api/client', () => {
  class ApiError extends Error {
    constructor(readonly status: number) {
      super(String(status));
    }
  }
  return { ApiError, api: { post } };
});

import { ApiError } from '../api/client';
import { flushRewardRequests, sendRewardRequest } from './rewardRequest';

describe('reward request offline queue', () => {
  beforeEach(() => {
    kv.clear();
    post.mockReset();
  });

  it('keeps an alert that could not reach the server and sends it on the next flush', async () => {
    post.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await sendRewardRequest('p1', 'home', 'Candy', 'first_then');
    expect(kv.get('pending_reward_requests')).toHaveLength(1);

    post.mockResolvedValueOnce({ notified: 1 });
    await flushRewardRequests();
    expect(post).toHaveBeenLastCalledWith('/profiles/p1/reward-request', expect.objectContaining({ reward_name: 'Candy', location_id: 'home' }));
    expect(kv.get('pending_reward_requests')).toEqual([]);
  });

  it('drops one the server refused, and one too old to matter', async () => {
    post.mockRejectedValueOnce(new (ApiError as unknown as new (s: number) => Error)(403));
    await sendRewardRequest('p1', null, 'Candy', 'chips');
    expect(kv.get('pending_reward_requests')).toBeUndefined();

    kv.set('pending_reward_requests', [{ profile_id: 'p1', body: {}, at: Date.now() - 4 * 60 * 60 * 1000 }]);
    await flushRewardRequests();
    expect(post).toHaveBeenCalledTimes(1);
    expect(kv.get('pending_reward_requests')).toEqual([]);
  });
});
