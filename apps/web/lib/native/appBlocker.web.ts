import { WebPlugin } from '@capacitor/core';
import type { AppBlockerPlugin, InstalledApp } from './appBlocker';

/** ponytail: no OS concept of "other installed apps" in a browser tab; every method is a safe no-op/empty result. */
export class AppBlockerWeb extends WebPlugin implements AppBlockerPlugin {
  async listInstalledApps(): Promise<{ apps: InstalledApp[] }> {
    return { apps: [] };
  }
  async setEnabled(): Promise<void> {}
  async setAllowedPackages(): Promise<void> {}
  async isServiceEnabled(): Promise<{ enabled: boolean }> {
    return { enabled: false };
  }
  async openAccessibilitySettings(): Promise<void> {}
}
