package org.chipperly.app;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    /** Set by LocateRequestMessagingService's lock_request handler: a remote "Lock" from the caregiver's own browser, same effect as tapping "Lock this device" here in person. */
    static final String EXTRA_LOCK_REQUESTED = "lock_requested";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(KioskPlugin.class);
        registerPlugin(AppBlockerPlugin.class);
        registerPlugin(DeviceLocatorPlugin.class);
        super.onCreate(savedInstanceState);
        maybeEnterLockTaskFromIntent(getIntent());
    }

    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        maybeEnterLockTaskFromIntent(intent);
    }

    private void maybeEnterLockTaskFromIntent(Intent intent) {
        if (intent != null && intent.getBooleanExtra(EXTRA_LOCK_REQUESTED, false)) {
            startLockTask();
        }
    }
}
