package org.chipperly.app;

import android.app.Activity;
import android.app.ActivityManager;
import android.app.admin.DevicePolicyManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.os.UserManager;
import android.provider.Settings;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Caregiver-facing app allow-list. This plugin only stores the caregiver's
 * choices (SharedPreferences, not plugin-instance memory) and answers
 * questions about the accessibility service's own on/off state --
 * ChipperlyBlockService (a separate component Android starts on its own)
 * is what actually reads these prefs and acts on them, so the two must
 * agree on where the data lives even when the webview isn't running.
 */
@CapacitorPlugin(name = "AppBlocker")
public class AppBlockerPlugin extends Plugin {

    static final String PREFS_NAME = "app_blocker";
    static final String KEY_ENABLED = "enabled";
    static final String KEY_ALLOWED_PACKAGES = "allowed_packages";
    /** JSON object string, {"packageName": allowedUntilEpochMs, ...} -- see ChipperlyBlockService.parseTimedAllowances. */
    static final String KEY_TIMED_ALLOWANCES = "timed_allowances";
    /** Set by launchApp when it had to drop a non-Device-Owner pin to open an allowed app; MainActivity.onResume re-pins and clears it. */
    static final String KEY_REPIN_ON_RETURN = "repin_on_return";
    /** "Phone is resting": everything but the notification bar, Settings and the dialer is blocked. Survives reboot (plain prefs). */
    static final String KEY_RESTING = "resting";
    /** Epoch ms; whole-phone free time, no blocking at all, until then. */
    static final String KEY_UNRESTRICTED_UNTIL = "unrestricted_until";

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    private DevicePolicyManager devicePolicyManager() {
        return (DevicePolicyManager) getContext().getSystemService(Context.DEVICE_POLICY_SERVICE);
    }

    private ComponentName adminComponent() {
        return new ComponentName(getContext(), ChipperlyDeviceAdminReceiver.class);
    }

    private boolean isDeviceOwnerApp() {
        DevicePolicyManager dpm = devicePolicyManager();
        return dpm != null && dpm.isDeviceOwnerApp(getContext().getPackageName());
    }

    private boolean isDeviceAdminActive() {
        DevicePolicyManager dpm = devicePolicyManager();
        return dpm != null && dpm.isAdminActive(adminComponent());
    }

    @PluginMethod
    public void listInstalledApps(PluginCall call) {
        PackageManager pm = getContext().getPackageManager();
        Intent launcherIntent = new Intent(Intent.ACTION_MAIN);
        launcherIntent.addCategory(Intent.CATEGORY_LAUNCHER);
        List<ResolveInfo> resolved = pm.queryIntentActivities(launcherIntent, 0);

        String ownPackage = getContext().getPackageName();
        Set<String> seen = new HashSet<>();
        JSArray apps = new JSArray();
        for (ResolveInfo info : resolved) {
            String packageName = info.activityInfo.packageName;
            // Some apps expose more than one launcher activity; list each package once.
            if (packageName.equals(ownPackage) || !seen.add(packageName)) continue;
            JSObject app = new JSObject();
            app.put("packageName", packageName);
            app.put("appName", info.loadLabel(pm).toString());
            apps.put(app);
        }

        JSObject result = new JSObject();
        result.put("apps", apps);
        call.resolve(result);
    }

    @PluginMethod
    public void setEnabled(PluginCall call) {
        boolean enabled = call.getBoolean("enabled", false);
        prefs().edit().putBoolean(KEY_ENABLED, enabled).apply();
        // Device-wide, so it also covers Force Stop/disable/uninstall/clear-data
        // for every app, not just the allow-list -- fine on what's meant to be
        // a dedicated child device, and only takes effect at all when this app
        // is Device Owner (see ChipperlyDeviceAdminReceiver).
        if (isDeviceOwnerApp()) {
            if (enabled) {
                devicePolicyManager().addUserRestriction(adminComponent(), UserManager.DISALLOW_APPS_CONTROL);
            } else {
                devicePolicyManager().clearUserRestriction(adminComponent(), UserManager.DISALLOW_APPS_CONTROL);
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void setAllowedPackages(PluginCall call) {
        JSArray packages = call.getArray("packages");
        Set<String> set = new HashSet<>();
        if (packages != null) {
            for (int i = 0; i < packages.length(); i++) {
                try {
                    set.add(packages.getString(i));
                } catch (JSONException ignored) {
                    // Skip anything that isn't a string; a partial list is safer than failing the whole save.
                }
            }
        }
        prefs().edit().putStringSet(KEY_ALLOWED_PACKAGES, set).apply();
        ChipperlyBlockService.syncLockTaskAllowlist(getContext());
        call.resolve();
    }

    /** `allowances`: [{packageName, allowedUntil (epoch ms)}, ...] -- caregiver-granted timed exceptions (AppBlockingScreen), on top of the permanent allow-list. */
    @PluginMethod
    public void setTimedAllowances(PluginCall call) {
        JSArray allowances = call.getArray("allowances");
        JSONObject map = new JSONObject();
        if (allowances != null) {
            for (int i = 0; i < allowances.length(); i++) {
                try {
                    org.json.JSONObject entry = allowances.getJSONObject(i);
                    String packageName = entry.getString("packageName");
                    long allowedUntil = entry.getLong("allowedUntil");
                    map.put(packageName, allowedUntil);
                } catch (JSONException ignored) {
                    // Skip anything malformed; a partial map is safer than failing the whole save.
                }
            }
        }
        prefs().edit().putString(KEY_TIMED_ALLOWANCES, map.toString()).apply();
        ChipperlyBlockService.syncLockTaskAllowlist(getContext());
        call.resolve();
    }

    /** Launches an app by package name, the same way the OS launcher would -- for the child-facing "allowed apps" list inside Chipperly itself, so there's a way to reach them without ever needing the system launcher. */
    @PluginMethod
    public void launchApp(PluginCall call) {
        String packageName = call.getString("packageName");
        if (packageName == null) {
            call.reject("packageName is required");
            return;
        }
        Intent launchIntent = getContext().getPackageManager().getLaunchIntentForPackage(packageName);
        if (launchIntent == null) {
            call.reject("No launchable activity for " + packageName);
            return;
        }
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        // Plain screen pinning (no Device Owner, so no setLockTaskPackages
        // allowlist) refuses to start any other app, allowed or not. Unpin
        // for the trip; ChipperlyBlockService still enforces the allow-list
        // meanwhile, and MainActivity.onResume pins again on the way back.
        Activity activity = getActivity();
        ActivityManager am = (ActivityManager) getContext().getSystemService(Context.ACTIVITY_SERVICE);
        boolean pinned = am != null && am.getLockTaskModeState() != ActivityManager.LOCK_TASK_MODE_NONE;
        if (pinned && !isDeviceOwnerApp() && activity != null) {
            prefs().edit().putBoolean(KEY_REPIN_ON_RETURN, true).apply();
            activity.stopLockTask();
        }
        getContext().startActivity(launchIntent);
        call.resolve();
    }

    /**
     * `deviceAdmin`: whether the in-app "Turn on tamper-proof mode" button
     * (requestDeviceAdmin, below) has been granted -- the normal, no-ADB
     * path, same mechanism Mobile Tracker Free's own manifest uses
     * (BIND_DEVICE_ADMIN alongside BIND_ACCESSIBILITY_SERVICE). Makes
     * uninstalling require deactivating this admin first.
     * `deviceOwner`: the strictly stronger, ADB-only path
     * (`adb shell dpm set-device-owner`, only accepted on a device with no
     * accounts yet) that additionally unlocks setLockTaskPackages/
     * DISALLOW_APPS_CONTROL (AppBlockerPlugin.setEnabled/
     * ChipperlyBlockService.syncLockTaskAllowlist) -- not something the UI
     * asks for, but honored automatically if a caregiver already did it.
     */
    @PluginMethod
    public void getTamperProofState(PluginCall call) {
        JSObject result = new JSObject();
        result.put("deviceAdmin", isDeviceAdminActive());
        result.put("deviceOwner", isDeviceOwnerApp());
        call.resolve(result);
    }

    /**
     * Opens the OS's own "Activate this device admin app?" screen -- Android
     * requires this be a manual, disclosed step, same as
     * openAccessibilitySettings below; no ADB, no computer needed.
     * Deliberately launched from the plugin's Activity (getActivity()), not
     * a bare FLAG_ACTIVITY_NEW_TASK Intent off getContext() the way
     * launchApp/openAccessibilitySettings do it: ACTION_ADD_DEVICE_ADMIN
     * specifically refuses to start as a new task (confirmed via logcat --
     * "Cannot start ADD_DEVICE_ADMIN as a new task" -- the request silently
     * closes itself a moment after opening), so it needs a real Activity
     * context instead.
     */
    @PluginMethod
    public void requestDeviceAdmin(PluginCall call) {
        Intent intent = new Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN);
        intent.putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, adminComponent());
        intent.putExtra(
            DevicePolicyManager.EXTRA_ADD_EXPLANATION,
            "Lets Chipperly resist being force-stopped or uninstalled without your PIN."
        );
        if (getActivity() != null) {
            getActivity().startActivity(intent);
        } else {
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        }
        call.resolve();
    }

    @PluginMethod
    public void isServiceEnabled(PluginCall call) {
        JSObject result = new JSObject();
        result.put("enabled", ChipperlyBlockService.isAccessibilityServiceEnabled(getContext()));
        call.resolve(result);
    }

    @PluginMethod
    public void openAccessibilitySettings(PluginCall call) {
        // Android requires the caregiver to flip this on manually in system
        // Settings -- an app can never enable its own accessibility service.
        Intent intent = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    @PluginMethod
    public void setResting(PluginCall call) {
        prefs().edit().putBoolean(KEY_RESTING, call.getBoolean("resting", false)).apply();
        applyPinPolicy();
        call.resolve();
    }

    @PluginMethod
    public void setUnrestrictedUntil(PluginCall call) {
        Long until = call.getLong("until");
        prefs().edit().putLong(KEY_UNRESTRICTED_UNTIL, until == null ? 0L : until).apply();
        applyPinPolicy();
        call.resolve();
    }

    private void applyPinPolicy() {
        if (getActivity() instanceof MainActivity) {
            MainActivity activity = (MainActivity) getActivity();
            activity.runOnUiThread(activity::applyPinPolicy);
        }
    }

    /**
     * Whether Doze/App Standby is allowed to defer this app. When it isn't
     * exempt, a killed/backgrounded process means ChipperlyBlockService's
     * redirect back to Chipperly is a cold start (new WebView, new JS boot)
     * instead of just bringing the existing task forward -- the slow
     * block/reopen a caregiver sees. This is a stock Android exemption
     * (requestIgnoreBatteryOptimizations, below); it does not cover MIUI's
     * separate, OEM-only Autostart toggle, which no public API can set.
     */
    @PluginMethod
    public void isIgnoringBatteryOptimizations(PluginCall call) {
        PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        JSObject result = new JSObject();
        result.put("ignoring", Build.VERSION.SDK_INT < Build.VERSION_CODES.M
            || (pm != null && pm.isIgnoringBatteryOptimizations(getContext().getPackageName())));
        call.resolve(result);
    }

    /** Opens this app's own notification settings, for when notifications (or the reward alerts channel) were turned off and Android won't prompt again. */
    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
        intent.putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    /** Opens the OS's own "Allow [app] to ignore battery optimizations?" dialog -- same disclosed-step requirement as openAccessibilitySettings/requestDeviceAdmin. */
    @PluginMethod
    public void requestIgnoreBatteryOptimizations(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
        intent.setData(Uri.parse("package:" + getContext().getPackageName()));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }
}
