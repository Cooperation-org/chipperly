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
  /** Launches an installed app by package name, same as tapping its icon in the system launcher -- lets the child open an allowed app from inside Chipperly itself. Android only; rejects on web. */
  launchApp(options: { packageName: string }): Promise<void>;
  /** Whether the caregiver has actually turned the accessibility service on in system settings -- enabling it in-app isn't possible, Android requires this to be a manual, disclosed step. */
  isServiceEnabled(): Promise<{ enabled: boolean }>;
  /** Opens system Settings > Accessibility so the caregiver can grant it. */
  openAccessibilitySettings(): Promise<void>;
  /**
   * `deviceAdmin`: whether requestDeviceAdmin (below) has been granted --
   * the normal, no-ADB tamper-resistance path (matches how Mobile Tracker
   * Free's own manifest does it: Device Admin + Accessibility Service).
   * `deviceOwner`: the strictly stronger, ADB-only path
   * (`adb shell dpm set-device-owner`, not something the UI asks for but
   * honored automatically if already done) that additionally turns "Lock
   * this device" into a real OS-enforced multi-app kiosk surviving Force
   * Stop and Recents, instead of a best-effort accessibility redirect.
   */
  getTamperProofState(): Promise<{ deviceAdmin: boolean; deviceOwner: boolean }>;
  /** Opens the OS's own "Activate this device admin app?" screen. No ADB, no computer -- Android just requires it be a manual, disclosed step, same as openAccessibilitySettings. */
  requestDeviceAdmin(): Promise<void>;
  /** Whether Doze/App Standby is allowed to defer this app. When false, a backgrounded/killed device means ChipperlyBlockService's redirect back to Chipperly is a cold start, not an instant foreground-bring. Doesn't cover MIUI's separate Autostart toggle -- no public API sets that one. */
  isIgnoringBatteryOptimizations(): Promise<{ ignoring: boolean }>;
  /** Opens the OS's own "Allow to ignore battery optimizations?" dialog, same disclosed-step requirement as the two above. */
  requestIgnoreBatteryOptimizations(): Promise<void>;
}

const AppBlocker = registerPlugin<AppBlockerPlugin>('AppBlocker', {
  web: () => import('./appBlocker.web').then((m) => new m.AppBlockerWeb()),
});

export default AppBlocker;
