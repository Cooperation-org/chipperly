package org.chipperly.app;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.provider.Settings;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;

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

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
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
}
