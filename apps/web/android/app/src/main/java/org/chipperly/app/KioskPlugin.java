package org.chipperly.app;

import android.app.Activity;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Focus mode, Android side: screen pinning via startLockTask(). Without a
 * device-owner/DPC allowlist this shows the system's own pin confirmation
 * dialog rather than pinning silently -- caregiver sees and approves it,
 * same as pinning an app manually from Recents.
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
