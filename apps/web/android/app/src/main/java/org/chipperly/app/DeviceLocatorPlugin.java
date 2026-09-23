package org.chipperly.app;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.provider.Settings;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Stores what LocateRequestMessagingService needs to answer a locate_request
 * FCM data message: that callback has no WebView/JS bridge (the app may be
 * killed), so it can't ask the web app for the device id, its report_token,
 * or the API base URL -- they're written here, once, right after the device
 * registers itself (lib/native/deviceLocator.ts), and read back natively.
 *
 * Also owns the location permission "Locate now" actually depends on:
 * ACCESS_FINE/COARSE_LOCATION (requestable through the normal system dialog,
 * the "location" alias below) and ACCESS_BACKGROUND_LOCATION (Android 11+
 * refuses to grant this from the same dialog -- openLocationSettings sends
 * the caregiver to pick "Allow all the time" by hand, same pattern as
 * AppBlockerPlugin.openAccessibilitySettings).
 */
@CapacitorPlugin(
    name = "DeviceLocator",
    permissions = {
        @Permission(strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }, alias = "location")
    }
)
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

    private boolean backgroundGranted() {
        return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    private JSObject permissionState() {
        JSObject result = new JSObject();
        result.put("foreground", getPermissionState("location") == PermissionState.GRANTED);
        result.put("background", backgroundGranted());
        return result;
    }

    @PluginMethod
    public void getLocationPermissionState(PluginCall call) {
        call.resolve(permissionState());
    }

    @PluginMethod
    public void requestLocationPermission(PluginCall call) {
        if (getPermissionState("location") == PermissionState.GRANTED) {
            call.resolve(permissionState());
        } else {
            requestPermissionForAlias("location", call, "locationPermsCallback");
        }
    }

    @PermissionCallback
    private void locationPermsCallback(PluginCall call) {
        call.resolve(permissionState());
    }

    /** Foreground granted but "Allow all the time" isn't: only system Settings can grant that on Android 11+, so this opens this app's own permission screen directly instead of just app info. */
    @PluginMethod
    public void openLocationSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        intent.setData(Uri.parse("package:" + getContext().getPackageName()));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }
}
