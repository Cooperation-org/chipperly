import type { RewardRequestSource } from '@chipperly/shared/schemas/push';
import { api } from '@/lib/api/client';
import { getDeviceId } from '@/lib/device/identity';

/** Alerts the parents, and the caregivers assigned to where the child is, that a reward is waiting (skipping this device). */
export async function sendRewardRequest(
  profileId: string,
  locationId: string | null,
  rewardName: string,
  source: RewardRequestSource,
): Promise<void> {
  try {
    await api.post(`/profiles/${profileId}/reward-request`, {
      reward_name: rewardName,
      source,
      location_id: locationId,
      device_id: await getDeviceId(),
    });
  } catch {
    // ponytail: offline, the alert is dropped rather than queued; the reward itself still syncs.
  }
}
