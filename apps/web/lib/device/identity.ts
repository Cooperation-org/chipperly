import { getKv, setKv } from '../db/kv';
import { newId } from '../ids';

const DEVICE_ID_KEY = 'device_id';

/**
 * Stable for the life of this install -- unlike `parent_mode`, never reset
 * on cold boot. This is what lets a caregiver name/find this exact device
 * from any other signed-in device (Settings > Devices, packages/shared's
 * device.ts): the id has to outlive app restarts and push token rotation.
 */
export async function getDeviceId(): Promise<string> {
  const existing = await getKv<string>(DEVICE_ID_KEY);
  if (existing) return existing;
  const id = newId();
  await setKv(DEVICE_ID_KEY, id);
  return id;
}
