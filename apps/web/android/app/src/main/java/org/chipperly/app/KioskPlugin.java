package org.chipperly.app;

import android.app.Activity;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Focus mode, Android side: screen pinning via startLockTask(). Without
 * Device Owner status this shows the system's own pin confirmation dialog
 * and pins only this one app -- same as pinning an app manually from
 * Recents. Once the caregiver has done the one-time `adb shell dpm
 * set-device-owner` step (AppBlockerPlugin.isDeviceOwner,
 * ChipperlyDeviceAdminReceiver) and AppBlockerPlugin has pushed an
 * allow-list via DevicePolicyManager.setLockTaskPackages, this same call
 * instead pins silently across every allow-listed app: no Recents, no
 * Force Stop escape, no confirmation dialog.
 */
@CapacitorPlugin(name = "Kiosk")
public class KioskPlugin extends Plugin {

    @PluginMethod
    public void enterFocusMode(PluginCall call) {
        Activity activity = getActivity();
        if (activity != null) {
            activity.startLockTask();
        }
        call.resolve();
    }

    @PluginMethod
    public void exitFocusMode(PluginCall call) {
        Activity activity = getActivity();
        if (activity != null) {
            activity.stopLockTask();
        }
        call.resolve();
    }
}
