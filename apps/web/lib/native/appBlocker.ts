import { registerPlugin } from '@capacitor/core';

export interface InstalledApp {
  packageName: string;
  appName: string;
}

export interface TimedAllowance {
  packageName: string;
  /** Epoch ms; the native side treats anything at or before now as already expired. */
  allowedUntil: number;
}

export interface AppBlockerPlugin {
  /** Every launchable app on the device, for the caregiver's allow-list picker. Android only -- resolves to [] elsewhere. */
  listInstalledApps(): Promise<{ apps: InstalledApp[] }>;
  /** Turns enforcement on/off. Off (the default) means the accessibility service, even if the user enabled it in system settings, does nothing. */
  setEnabled(options: { enabled: boolean }): Promise<void>;
  /** Packages that stay allowed while enforcement is on. Chipperly's own package is always implicitly allowed; don't include it. */
  setAllowedPackages(options: { packages: string[] }): Promise<void>;
  /** Packages allowed on top of the permanent list until their own `allowedUntil` (e.g. "YouTube for 1 hour"); the native service re-checks this on a timer so an expired grant is enforced even if the child never switches apps. */
  setTimedAllowances(options: { allowances: TimedAllowance[] }): Promise<void>;
  /** Whether the caregiver has actually turned the accessibility service on in system settings -- enabling it in-app isn't possible, Android requires this to be a manual, disclosed step. */
  isServiceEnabled(): Promise<{ enabled: boolean }>;
  /** Opens system Settings > Accessibility so the caregiver can grant it. */
  openAccessibilitySettings(): Promise<void>;
}

const AppBlocker = registerPlugin<AppBlockerPlugin>('AppBlocker', {
  web: () => import('./appBlocker.web').then((m) => new m.AppBlockerWeb()),
});

export default AppBlocker;
