package org.chipperly.app;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    /** Set by LocateRequestMessagingService's lock_request/unlock_request handlers: a remote Lock/Unlock from the caregiver's own browser, same effect as the local buttons here in person. */
    static final String EXTRA_LOCK_REQUESTED = "lock_requested";
    static final String EXTRA_UNLOCK_REQUESTED = "unlock_requested";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(KioskPlugin.class);
        registerPlugin(AppBlockerPlugin.class);
        registerPlugin(DeviceLocatorPlugin.class);
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
        SharedPreferences prefs = getSharedPreferences(AppBlockerPlugin.PREFS_NAME, Context.MODE_PRIVATE);
        if (prefs.getBoolean(AppBlockerPlugin.KEY_REPIN_ON_RETURN, false)) {
            prefs.edit().remove(AppBlockerPlugin.KEY_REPIN_ON_RETURN).apply();
            startLockTask();
        }
    }

    private void maybeApplyLockFromIntent(Intent intent) {
        if (intent == null) return;
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
