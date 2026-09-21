import { WebPlugin } from '@capacitor/core';
import type { DeviceLocatorPlugin } from './deviceLocator';

/** ponytail: no killed-app FCM handler in a browser tab to configure; a safe no-op. */
export class DeviceLocatorWeb extends WebPlugin implements DeviceLocatorPlugin {
  async setReportConfig(): Promise<void> {}
}
