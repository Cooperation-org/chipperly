package org.chipperly.app;

import android.app.Activity;
import android.app.ActivityManager;
import android.content.Context;
import com.getcapacitor.JSObject;
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

    /**
     * Whether Android's lock task mode is engaged right now, regardless of
     * how it got that way. A remote "Lock" (LocateRequestMessagingService's
     * lock_request handler) calls startLockTask() natively with no WebView
     * around to also set the JS-side locked_profile_id that arms
     * ChildToday's back-navigation trap -- this lets a guard mounted once
     * the webview *is* up reconcile that gap instead of duplicating the
     * native/JS bridge for every future lock trigger.
     */
    @PluginMethod
    public void isLockTaskActive(PluginCall call) {
        ActivityManager am = (ActivityManager) getContext().getSystemService(Context.ACTIVITY_SERVICE);
        JSObject result = new JSObject();
        result.put("active", am != null && am.getLockTaskModeState() != ActivityManager.LOCK_TASK_MODE_NONE);
        call.resolve(result);
    }
}
