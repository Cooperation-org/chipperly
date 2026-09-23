package org.chipperly.app;

import android.accessibilityservice.AccessibilityService;
import android.app.admin.DevicePolicyManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.telecom.TelecomManager;
import android.text.TextUtils;
import android.util.Log;
import android.view.accessibility.AccessibilityEvent;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/**
 * Watches which app is in the foreground and nothing else. The config XML
 * (chipperly_block_service_config.xml) sets canRetrieveWindowContent to
 * false and only requests TYPE_WINDOW_STATE_CHANGED, so this service is
 * structurally unable to read screen content, text, or any other app's
 * data -- it only ever learns a package name.
 *
 * enabled/allowed-packages live in SharedPreferences under
 * AppBlockerPlugin.PREFS_NAME, not in this service's own fields, because
 * Android starts and stops this component on its own schedule, independent
 * of the app's webview/plugin instance.
 */
public class ChipperlyBlockService extends AccessibilityService {

    // A small, fixed set of system packages the device needs to stay usable
    // with enforcement on: the status bar/recents/quick settings, the
    // Settings app itself (so the caregiver can always get back in to turn
    // this off), and the AOSP in-call/emergency-dialer package. The
    // caregiver's chosen default dialer is checked separately at runtime
    // since that varies by phone. ponytail: covers stock Android and Pixel;
    // some OEM skins use different systemui/phone package names -- add
    // theirs here if a caregiver reports getting bounced out of Settings.
    private static final Set<String> SYSTEM_ALLOWLIST = new HashSet<>();
    static {
        SYSTEM_ALLOWLIST.add("com.android.systemui");
        SYSTEM_ALLOWLIST.add("android");
        SYSTEM_ALLOWLIST.add("com.android.settings");
        SYSTEM_ALLOWLIST.add("com.android.phone");
    }

    // A timed allowance (e.g. "YouTube for 1 hour", AppBlockingScreen's timed
    // grant) only stops a *new* window-state-changed event -- it does nothing
    // for a child who just stays inside the allowed app until time runs out.
    // This tracks the last package we actually saw in the foreground and
    // re-checks it on a plain timer so an expired grant still gets enforced
    // within about RECHECK_INTERVAL_MS, without needing to read window
    // content (canRetrieveWindowContent stays false).
    private static final long RECHECK_INTERVAL_MS = 20_000;
    private final Handler recheckHandler = new Handler(Looper.getMainLooper());
    private String lastForegroundPackage;
    private final Runnable recheckRunnable = new Runnable() {
        @Override
        public void run() {
            if (lastForegroundPackage != null) maybeBlock(lastForegroundPackage);
            syncLockTaskAllowlist(ChipperlyBlockService.this);
            recheckHandler.postDelayed(this, RECHECK_INTERVAL_MS);
        }
    };

    @Override
    protected void onServiceConnected() {
        recheckHandler.postDelayed(recheckRunnable, RECHECK_INTERVAL_MS);
    }

    @Override
    public boolean onUnbind(Intent intent) {
        recheckHandler.removeCallbacks(recheckRunnable);
        return super.onUnbind(intent);
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event.getEventType() != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return;
        CharSequence packageNameSeq = event.getPackageName();
        String foregroundPackage = packageNameSeq == null ? null : packageNameSeq.toString();
        if (foregroundPackage == null) return;
        lastForegroundPackage = foregroundPackage;
        maybeBlock(foregroundPackage);
    }

    private void maybeBlock(String foregroundPackage) {
        SharedPreferences prefs = getSharedPreferences(AppBlockerPlugin.PREFS_NAME, MODE_PRIVATE);
        // Resting overrides everything, including a switched-off allow-list and
        // free time, and needs no network or JS: it's read straight from prefs,
        // so it holds from the first app opened after a reboot.
        if (prefs.getBoolean(AppBlockerPlugin.KEY_RESTING, false)) {
            if (!restingAllowSet(getPackageName(), defaultDialerPackage()).contains(foregroundPackage)) bringChipperlyBack();
            return;
        }
        if (System.currentTimeMillis() < prefs.getLong(AppBlockerPlugin.KEY_UNRESTRICTED_UNTIL, 0L)) return;
        boolean enabled = prefs.getBoolean(AppBlockerPlugin.KEY_ENABLED, false);
        if (!enabled) return;

        Set<String> caregiverAllowed = prefs.getStringSet(AppBlockerPlugin.KEY_ALLOWED_PACKAGES, Collections.<String>emptySet());
        Set<String> allowSet = buildAllowSet(getPackageName(), caregiverAllowed, defaultDialerPackage(), resolveLauncherPackage());
        String timedJson = prefs.getString(AppBlockerPlugin.KEY_TIMED_ALLOWANCES, null);
        allowSet.addAll(activeTimedPackages(parseTimedAllowances(timedJson), System.currentTimeMillis()));
        if (!shouldBlock(foregroundPackage, true, allowSet)) return;
        bringChipperlyBack();
    }

    private void bringChipperlyBack() {
        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        intent.putExtra("blocked", true);
        startActivity(intent);
    }

    /**
     * What stays usable while resting: Chipperly, the status bar / notification
     * shade and its quick settings (Wi-Fi, data), Settings behind them, and the
     * phone/dialer for emergencies. Unlike buildAllowSet: no launcher, and no
     * caregiver or timed allow-list. Pure, for the plain JUnit test.
     */
    static Set<String> restingAllowSet(String ownPackage, String defaultDialerPackage) {
        Set<String> allow = new HashSet<>(SYSTEM_ALLOWLIST);
        if (ownPackage != null) allow.add(ownPackage);
        if (defaultDialerPackage != null) allow.add(defaultDialerPackage);
        return allow;
    }

    @Override
    public void onInterrupt() {
        // Required override; there's no ongoing feedback (sound/vibration) to stop.
    }

    /** `{"packageName": allowedUntilEpochMs, ...}` -> parsed map. Android-only (org.json); the pure decision below takes plain data so it stays plain-JUnit testable. Package-private: AppBlockerPlugin reuses this to keep DevicePolicyManager's lock-task allowlist in sync with the same timed grants. */
    static Map<String, Long> parseTimedAllowances(String json) {
        Map<String, Long> result = new HashMap<>();
        if (TextUtils.isEmpty(json)) return result;
        try {
            JSONObject obj = new JSONObject(json);
            java.util.Iterator<String> keys = obj.keys();
            while (keys.hasNext()) {
                String packageName = keys.next();
                result.put(packageName, obj.getLong(packageName));
            }
        } catch (JSONException e) {
            Log.w("ChipperlyBlockService", "Malformed timed allowances JSON, ignoring", e);
        }
        return result;
    }

    /** Pure: which packages from a package->allowedUntil map are still within their window at `nowMs`. */
    static Set<String> activeTimedPackages(Map<String, Long> timedAllowances, long nowMs) {
        Set<String> active = new HashSet<>();
        if (timedAllowances == null) return active;
        for (Map.Entry<String, Long> entry : timedAllowances.entrySet()) {
            Long allowedUntil = entry.getValue();
            if (allowedUntil != null && allowedUntil > nowMs) active.add(entry.getKey());
        }
        return active;
    }

    private String defaultDialerPackage() {
        TelecomManager telecomManager = (TelecomManager) getSystemService(TELECOM_SERVICE);
        return telecomManager == null ? null : telecomManager.getDefaultDialerPackage();
    }

    private String resolveLauncherPackage() {
        Intent homeIntent = new Intent(Intent.ACTION_MAIN);
        homeIntent.addCategory(Intent.CATEGORY_HOME);
        ResolveInfo info = getPackageManager().resolveActivity(homeIntent, PackageManager.MATCH_DEFAULT_ONLY);
        return (info != null && info.activityInfo != null) ? info.activityInfo.packageName : null;
    }

    /**
     * Everything that's never blocked: the caregiver's allow-list plus the
     * fixed safety carve-outs (own app, dialer, launcher, system UI).
     * No Android framework types in the signature, so this is covered by a
     * plain JUnit test (ChipperlyBlockServiceTest) with no Robolectric.
     */
    static Set<String> buildAllowSet(String ownPackage, Set<String> caregiverAllowed, String defaultDialerPackage, String launcherPackage) {
        Set<String> allow = new HashSet<>(SYSTEM_ALLOWLIST);
        if (caregiverAllowed != null) allow.addAll(caregiverAllowed);
        if (ownPackage != null) allow.add(ownPackage);
        if (defaultDialerPackage != null) allow.add(defaultDialerPackage);
        if (launcherPackage != null) allow.add(launcherPackage);
        return allow;
    }

    /** Pure decision: block only when enforcement is on and the package isn't in the allow set. */
    static boolean shouldBlock(String foregroundPackage, boolean enabled, Set<String> allowSet) {
        if (!enabled || foregroundPackage == null) return false;
        return !allowSet.contains(foregroundPackage);
    }

    /**
     * Pushes the current effective allow-list (permanent + still-active
     * timed) to DevicePolicyManager.setLockTaskPackages -- a no-op unless
     * this app is Device Owner (ChipperlyDeviceAdminReceiver, granted via a
     * one-time `adb shell dpm set-device-owner` the caregiver runs before
     * any account is added to the device). Called both right after
     * AppBlockerPlugin saves a new allow-list/timed-allowance, and from this
     * service's existing 20s recheck timer, so a timed grant expiring while
     * nothing else changes still drops out of the OS-enforced lock-task
     * allowlist within RECHECK_INTERVAL_MS, the same latency the
     * accessibility-redirect path already accepts for the same reason.
     */
    static void syncLockTaskAllowlist(Context context) {
        DevicePolicyManager dpm = (DevicePolicyManager) context.getSystemService(Context.DEVICE_POLICY_SERVICE);
        String ownPackage = context.getPackageName();
        if (dpm == null || !dpm.isDeviceOwnerApp(ownPackage)) return;

        SharedPreferences prefs = context.getSharedPreferences(AppBlockerPlugin.PREFS_NAME, MODE_PRIVATE);
        Set<String> allowSet = new HashSet<>(prefs.getStringSet(AppBlockerPlugin.KEY_ALLOWED_PACKAGES, Collections.<String>emptySet()));
        allowSet.addAll(activeTimedPackages(parseTimedAllowances(prefs.getString(AppBlockerPlugin.KEY_TIMED_ALLOWANCES, null)), System.currentTimeMillis()));
        allowSet.add(ownPackage);

        ComponentName admin = new ComponentName(context, ChipperlyDeviceAdminReceiver.class);
        dpm.setLockTaskPackages(admin, allowSet.toArray(new String[0]));
    }

    /** Standard way to check whether the caregiver has actually turned this service on in system Settings. */
    static boolean isAccessibilityServiceEnabled(Context context) {
        String expected = context.getPackageName() + "/" + ChipperlyBlockService.class.getName();
        String enabledServices = Settings.Secure.getString(context.getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
        if (TextUtils.isEmpty(enabledServices)) return false;

        TextUtils.SimpleStringSplitter splitter = new TextUtils.SimpleStringSplitter(':');
        splitter.setString(enabledServices);
        while (splitter.hasNext()) {
            if (splitter.next().equalsIgnoreCase(expected)) return true;
        }
        return false;
    }
}
