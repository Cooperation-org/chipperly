import type { RewardRequestSource } from '@chipperly/shared/schemas/push';
import { api } from '@/lib/api/client';
import { getDeviceId } from '@/lib/device/identity';

/** Alerts the caregivers' phones that the child is ready for a reward (skipping this device). */
export async function sendRewardRequest(profileId: string, rewardName: string, source: RewardRequestSource): Promise<void> {
  try {
    await api.post(`/profiles/${profileId}/reward-request`, { reward_name: rewardName, source, device_id: await getDeviceId() });
  } catch {
    // ponytail: offline, the alert is dropped rather than queued; the reward itself still syncs.
  }
}
