import { WebPlugin } from '@capacitor/core';
import type { KioskPlugin } from './kiosk';

/** ponytail: no OS-level lock exists in a plain browser tab; Focus mode falls back to the existing in-app PIN lock (LockSheet/UnlockOverlay). */
export class KioskWeb extends WebPlugin implements KioskPlugin {
  async enterFocusMode(): Promise<void> {}
  async exitFocusMode(): Promise<void> {}
  async isLockTaskActive(): Promise<{ active: boolean }> {
    return { active: false };
  }
}
