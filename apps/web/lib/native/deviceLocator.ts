import { registerPlugin } from '@capacitor/core';

export interface DeviceLocatorPlugin {
  /** Stores what a killed-app locate_request FCM handler needs to answer it (see android's LocateRequestMessagingService), since that context has no access to the web app's own session/API client. */
  setReportConfig(options: { deviceId: string; reportToken: string; apiBase: string }): Promise<void>;
}

const DeviceLocator = registerPlugin<DeviceLocatorPlugin>('DeviceLocator', {
  web: () => import('./deviceLocator.web').then((m) => new m.DeviceLocatorWeb()),
});

export default DeviceLocator;
