import { registerPlugin } from '@capacitor/core';

export interface KioskPlugin {
  /** Requests the OS-level single-app lock (iOS Guided Access, Android screen pinning). No-op in a browser tab. */
  enterFocusMode(options: { profileName: string }): Promise<void>;
  /** Releases the lock requested by enterFocusMode. */
  exitFocusMode(): Promise<void>;
  /** Whether the OS-level lock is engaged right now, however it got that way -- a remote "Lock" (no WebView around to set locked_profile_id itself) included. Android only; always false on web. */
  isLockTaskActive(): Promise<{ active: boolean }>;
}

const Kiosk = registerPlugin<KioskPlugin>('Kiosk', {
  web: () => import('./kiosk.web').then((m) => new m.KioskWeb()),
});

export default Kiosk;
