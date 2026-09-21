package org.chipperly.app;

import android.app.admin.DeviceAdminReceiver;

/**
 * No behavior of its own -- Android requires an admin receiver component to
 * exist and be named in the manifest before `dpm set-device-owner` (the
 * caregiver's one-time ADB step, done before any account is added to the
 * device) will accept this app as Device Owner. Once that's granted,
 * AppBlockerPlugin talks to DevicePolicyManager directly; nothing here
 * needs to react to admin lifecycle callbacks.
 */
public class ChipperlyDeviceAdminReceiver extends DeviceAdminReceiver {
}
