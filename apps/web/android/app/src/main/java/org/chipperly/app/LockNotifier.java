package org.chipperly.app;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;

import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

/**
 * Posts the one lock/unlock confirmation notification, called from both
 * places that actually engage/release lock task mode: KioskPlugin (the
 * in-person "Lock this device"/"Caregiver unlock" buttons) and MainActivity
 * (a remote lock_request/unlock_request pushed via
 * LocateRequestMessagingService). One shared place so the two triggers can't
 * drift apart on channel id or wording.
 */
final class LockNotifier {

    private static final String TAG = "LockNotifier";
    private static final String CHANNEL_ID = "lock_state";
    private static final int NOTIFICATION_ID = 1001;

    private LockNotifier() {}

    /**
     * Best-effort: both callers run this right after startLockTask/
     * stopLockTask, in the same method that still has to call
     * PluginCall.resolve()/return control to onCreate -- any exception
     * escaping here (a stricter OEM notification policy, anything) would
     * otherwise take the actual lock/unlock action down with it, which is
     * worse than a missing notification.
     */
    static void notify(Context context, boolean locked) {
        try {
            postNotification(context, locked);
        } catch (RuntimeException e) {
            Log.w(TAG, "Failed to post lock/unlock notification", e);
        }
    }

    private static void postNotification(Context context, boolean locked) {
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            manager.createNotificationChannel(
                new NotificationChannel(CHANNEL_ID, "Lock status", NotificationManager.IMPORTANCE_LOW)
            );
        }
        // Android 13+ needs POST_NOTIFICATIONS granted; PushRegistrationGuard
        // already requests it on sign-in for push, so this rides on that
        // instead of prompting again -- if it's still missing, skip silently
        // rather than crash (NotificationManagerCompat.notify would throw).
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return;
        }

        NotificationCompat.Builder notification = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(locked ? "Chipperly locked this device" : "Chipperly unlocked this device")
                .setContentText(locked ? "Only Chipperly and its allowed apps can open now." : "This device is back to normal.")
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setAutoCancel(true);
        manager.notify(NOTIFICATION_ID, notification.build());
    }
}
