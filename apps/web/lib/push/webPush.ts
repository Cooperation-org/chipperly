import { api } from '@/lib/api/client';
import { getDeviceId } from '@/lib/device/identity';

/** Browser push needs a service worker, PushManager and Notification; iPhone Safari only has them once added to the Home Screen. */
export function webPushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

/** Subscribes this browser (permission must already be granted) and tells the server; false when push isn't set up there. */
export async function subscribeWebPush(): Promise<boolean> {
  const { key } = await api.get<{ key: string | null }>('/me/push/web-key');
  if (!key) return false;
  const registration = await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) }));
  await api.put('/me/push-token', { token: JSON.stringify(subscription), platform: 'web', device_id: await getDeviceId() });
  return true;
}
