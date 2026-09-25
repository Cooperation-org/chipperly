package org.chipperly.app;

import android.app.ActivityManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    /** Set by LocateRequestMessagingService's lock_request/unlock_request handlers: a remote Lock/Unlock from the caregiver's own browser, same effect as the local buttons here in person. */
    static final String EXTRA_LOCK_REQUESTED = "lock_requested";
    static final String EXTRA_UNLOCK_REQUESTED = "unlock_requested";
    /** Set by LocateRequestMessagingService after a rest/wake/free push has already updated the prefs. */
    static final String EXTRA_POLICY_CHANGED = "policy_changed";
    /** Set by RewardNotifier: the app page a tapped notification opens (e.g. a child's Chips). */
    static final String EXTRA_OPEN_PATH = "open_path";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(KioskPlugin.class);
        registerPlugin(AppBlockerPlugin.class);
        registerPlugin(DeviceLocatorPlugin.class);
        registerPlugin(SpeechPlugin.class);
        super.onCreate(savedInstanceState);
        maybeApplyLockFromIntent(getIntent());
    }

    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        maybeApplyLockFromIntent(intent);
    }

    @Override
    public void onResume() {
        super.onResume();
        applyPinPolicy();
    }

    /**
     * The one place that decides whether this device should be pinned right
     * now. Resting keeps the notification bar usable (Wi-Fi, data), which
     * pinning disables, and free time lets every app open, which pinning
     * refuses, so both unpin and remember to pin again. Once neither holds
     * (checked on every resume, e.g. when blocking brings Chipperly back as
     * free time runs out) the pin comes back. Also re-pins after launchApp's
     * trip out to an allowed app.
     */
    void applyPinPolicy() {
        SharedPreferences prefs = getSharedPreferences(AppBlockerPlugin.PREFS_NAME, Context.MODE_PRIVATE);
        boolean resting = prefs.getBoolean(AppBlockerPlugin.KEY_RESTING, false);
        boolean free = System.currentTimeMillis() < prefs.getLong(AppBlockerPlugin.KEY_UNRESTRICTED_UNTIL, 0L);
        ActivityManager am = (ActivityManager) getSystemService(Context.ACTIVITY_SERVICE);
        boolean pinned = am != null && am.getLockTaskModeState() != ActivityManager.LOCK_TASK_MODE_NONE;
        if ((resting || free) && pinned) {
            prefs.edit().putBoolean(AppBlockerPlugin.KEY_REPIN_ON_RETURN, true).apply();
            stopLockTask();
        } else if (!resting && !free && !pinned && prefs.getBoolean(AppBlockerPlugin.KEY_REPIN_ON_RETURN, false)) {
            prefs.edit().remove(AppBlockerPlugin.KEY_REPIN_ON_RETURN).apply();
            startLockTask();
        }
    }

    private void maybeApplyLockFromIntent(Intent intent) {
        if (intent == null) return;
        String openPath = intent.getStringExtra(EXTRA_OPEN_PATH);
        if (openPath != null && getBridge() != null) {
            getBridge().getWebView().loadUrl(getBridge().getLocalUrl() + "/" + openPath);
            return;
        }
        if (intent.getBooleanExtra(EXTRA_POLICY_CHANGED, false)) {
            applyPinPolicy();
            return;
        }
        if (intent.getBooleanExtra(EXTRA_LOCK_REQUESTED, false)) {
            startLockTask();
            LockNotifier.notify(this, true);
        } else if (intent.getBooleanExtra(EXTRA_UNLOCK_REQUESTED, false)) {
            // A remote unlock while the child was out in an allowed app must not be undone by onResume's re-pin.
            getSharedPreferences(AppBlockerPlugin.PREFS_NAME, Context.MODE_PRIVATE).edit().remove(AppBlockerPlugin.KEY_REPIN_ON_RETURN).apply();
            stopLockTask();
            LockNotifier.notify(this, false);
        }
    }
}
