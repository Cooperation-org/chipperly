package org.chipperly.app;

import android.content.Context;
import android.content.SharedPreferences;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Stores what LocateRequestMessagingService needs to answer a locate_request
 * FCM data message: that callback has no WebView/JS bridge (the app may be
 * killed), so it can't ask the web app for the device id, its report_token,
 * or the API base URL -- they're written here, once, right after the device
 * registers itself (lib/native/deviceLocator.ts), and read back natively.
 */
@CapacitorPlugin(name = "DeviceLocator")
public class DeviceLocatorPlugin extends Plugin {

    static final String PREFS_NAME = "device_locator";
    static final String KEY_DEVICE_ID = "device_id";
    static final String KEY_REPORT_TOKEN = "report_token";
    static final String KEY_API_BASE = "api_base";

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    @PluginMethod
    public void setReportConfig(PluginCall call) {
        String deviceId = call.getString("deviceId");
        String reportToken = call.getString("reportToken");
        String apiBase = call.getString("apiBase");
        prefs().edit()
                .putString(KEY_DEVICE_ID, deviceId)
                .putString(KEY_REPORT_TOKEN, reportToken)
                .putString(KEY_API_BASE, apiBase)
                .apply();
        call.resolve();
    }
}
