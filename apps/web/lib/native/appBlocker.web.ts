import { WebPlugin } from '@capacitor/core';
import type { AppBlockerPlugin, InstalledApp } from './appBlocker';

/** ponytail: no OS concept of "other installed apps" in a browser tab; every method is a safe no-op/empty result. */
export class AppBlockerWeb extends WebPlugin implements AppBlockerPlugin {
  async listInstalledApps(): Promise<{ apps: InstalledApp[] }> {
    return { apps: [] };
  }
  async setEnabled(): Promise<void> {}
  async setAllowedPackages(): Promise<void> {}
  async setTimedAllowances(): Promise<void> {}
  async launchApp(): Promise<void> {
    throw new Error('launchApp is not available on web');
  }
  async isServiceEnabled(): Promise<{ enabled: boolean }> {
    return { enabled: false };
  }
  async openAccessibilitySettings(): Promise<void> {}
  async getTamperProofState(): Promise<{ deviceAdmin: boolean; deviceOwner: boolean }> {
    return { deviceAdmin: false, deviceOwner: false };
  }
  async requestDeviceAdmin(): Promise<void> {}
  async isIgnoringBatteryOptimizations(): Promise<{ ignoring: boolean }> {
    return { ignoring: false };
  }
  async requestIgnoreBatteryOptimizations(): Promise<void> {}
}
