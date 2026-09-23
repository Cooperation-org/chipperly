import { WebPlugin } from '@capacitor/core';
import type { DeviceLocatorPlugin, LocationPermissionState } from './deviceLocator';

/** ponytail: no killed-app FCM handler in a browser tab to configure; a safe no-op. */
export class DeviceLocatorWeb extends WebPlugin implements DeviceLocatorPlugin {
  async setReportConfig(): Promise<void> {}
  async getLocationPermissionState(): Promise<LocationPermissionState> {
    return { foreground: false, background: false };
  }
  async requestLocationPermission(): Promise<LocationPermissionState> {
    return { foreground: false, background: false };
  }
  async openLocationSettings(): Promise<void> {}
}
