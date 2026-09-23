import { registerPlugin } from '@capacitor/core';

export interface LocationPermissionState {
  /** ACCESS_FINE/COARSE_LOCATION -- grantable through the normal system dialog. */
  foreground: boolean;
  /** ACCESS_BACKGROUND_LOCATION -- what a locate_request needs when the app has no foreground Activity; Android 11+ only grants this from system Settings, not a dialog. */
  background: boolean;
}

export interface DeviceLocatorPlugin {
  /** Stores what a killed-app locate_request FCM handler needs to answer it (see android's LocateRequestMessagingService), since that context has no access to the web app's own session/API client. */
  setReportConfig(options: { deviceId: string; reportToken: string; apiBase: string }): Promise<void>;
  getLocationPermissionState(): Promise<LocationPermissionState>;
  /** Triggers the system dialog for foreground location only; background can't be granted this way, see openLocationSettings. */
  requestLocationPermission(): Promise<LocationPermissionState>;
  /** Opens this app's own permission screen so the caregiver can pick "Allow all the time" for background. */
  openLocationSettings(): Promise<void>;
}

const DeviceLocator = registerPlugin<DeviceLocatorPlugin>('DeviceLocator', {
  web: () => import('./deviceLocator.web').then((m) => new m.DeviceLocatorWeb()),
});

export default DeviceLocator;
