import type { RewardRequestBody, RewardRequestSource } from '@chipperly/shared/schemas/push';
import { api, ApiError } from '../api/client';
import { getDeviceId } from '../device/identity';
import { getKv, setKv } from '../db/kv';

interface PendingRequest {
  profile_id: string;
  body: RewardRequestBody;
  at: number;
}

const QUEUE_KEY = 'pending_reward_requests';
/** An alert this late is news, not a request; drop it rather than buzz a caregiver about this morning. */
const MAX_AGE_MS = 3 * 60 * 60 * 1000;

/** 'retry' only for a failure worth trying again later (offline, server down); a refused request is dropped. */
async function send(request: PendingRequest): Promise<'sent' | 'refused' | 'retry'> {
  try {
    await api.post(`/profiles/${request.profile_id}/reward-request`, request.body);
    return 'sent';
  } catch (err) {
    return err instanceof ApiError && err.status >= 400 && err.status < 500 ? 'refused' : 'retry';
  }
}

/** Alerts the parents, and the caregivers assigned to where the child is, that a reward is waiting (skipping this device). Offline, it waits for flushRewardRequests. Resolves true only when the server took the alert just now, so a screen can say the team was told only when that is so. */
export async function sendRewardRequest(
  profileId: string,
  locationId: string | null,
  rewardName: string,
  source: RewardRequestSource,
  activityName?: string,
): Promise<boolean> {
  const request: PendingRequest = {
    profile_id: profileId,
    body: { reward_name: rewardName, source, location_id: locationId, device_id: await getDeviceId(), activity_name: activityName },
    at: Date.now(),
  };
  const result = await send(request);
  if (result !== 'retry') return result === 'sent';
  const queue = (await getKv<PendingRequest[]>(QUEUE_KEY)) ?? [];
  await setKv(QUEUE_KEY, [...queue, request]);
  return false;
}

/** Sends alerts queued while offline; called after each sync cycle (lib/sync/engine.ts). */
export async function flushRewardRequests(): Promise<void> {
  const queue = (await getKv<PendingRequest[]>(QUEUE_KEY)) ?? [];
  if (queue.length === 0) return;
  const left: PendingRequest[] = [];
  for (const request of queue) {
    if (Date.now() - request.at > MAX_AGE_MS) continue;
    if ((await send(request)) === 'retry') left.push(request);
  }
  await setKv(QUEUE_KEY, left);
}
