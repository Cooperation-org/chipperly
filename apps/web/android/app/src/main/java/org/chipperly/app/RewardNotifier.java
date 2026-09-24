package org.chipperly.app;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

/**
 * The caregiver's "child wants a reward" alert (POST
 * /profiles/:id/reward-request, delivered as a data push to
 * LocateRequestMessagingService). Its own high-importance channel, so it
 * pops up as a heads-up with sound even while the phone is in use.
 */
final class RewardNotifier {

    private static final String TAG = "RewardNotifier";
    private static final String CHANNEL_ID = "reward_requests";

    private RewardNotifier() {}

    static void notify(Context context, String title, String body, String path) {
        try {
            NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager == null) return;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                manager.createNotificationChannel(
                    new NotificationChannel(CHANNEL_ID, "Reward requests", NotificationManager.IMPORTANCE_HIGH)
                );
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                    && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                return;
            }

            Intent open = new Intent(context, MainActivity.class);
            open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
            if (path != null) open.putExtra(MainActivity.EXTRA_OPEN_PATH, path);
            int id = (int) (System.currentTimeMillis() & 0x7fffffff);
            // A request code per notification, so each tap carries its own child's path.
            PendingIntent tap = PendingIntent.getActivity(context, id, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

            NotificationCompat.Builder notification = new NotificationCompat.Builder(context, CHANNEL_ID)
                    .setSmallIcon(R.mipmap.ic_launcher)
                    .setContentTitle(title != null ? title : "A reward is waiting")
                    .setContentText(body)
                    .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                    .setPriority(NotificationCompat.PRIORITY_HIGH)
                    .setCategory(NotificationCompat.CATEGORY_REMINDER)
                    .setDefaults(NotificationCompat.DEFAULT_ALL)
                    .setContentIntent(tap)
                    .setAutoCancel(true);
            // Each request its own notification, so two in a row don't overwrite each other.
            manager.notify(id, notification.build());
        } catch (RuntimeException e) {
            Log.w(TAG, "Failed to post reward request notification", e);
        }
    }
}
