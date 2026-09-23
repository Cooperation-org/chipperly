package org.chipperly.app;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.location.Location;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;

import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.android.gms.location.CurrentLocationRequest;
import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;
import com.google.android.gms.tasks.CancellationTokenSource;
import com.google.android.gms.tasks.Tasks;
import com.google.firebase.messaging.RemoteMessage;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/**
 * Answers two caregiver-triggered remote requests, even when Chipperly is
 * fully killed and there's no WebView/Activity to talk to:
 *
 * - "Locate now" (POST /me/devices/:id/locate): reports this device's
 *   current position via Google Play services + a direct API call.
 * - "Lock"/"Unlock" (POST /me/devices/:id/lock or /unlock): engages or
 *   releases the same OS-level lock as tapping "Lock this device" in
 *   person, using whatever allow-list is already synced into
 *   AppBlockerPlugin's SharedPreferences -- all plain Android/Java work, so
 *   none of it needs the JS session this context can't reach. Bringing
 *   MainActivity to the front (rather than calling startLockTask/
 *   stopLockTask directly here, which need a live Activity) is also what
 *   lets LockTaskReconcileGuard, once the webview it hosts is up, fix the
 *   one thing this can't: locked_profile_id, the JS-side flag that arms
 *   ChildToday's back-navigation trap.
 */
public class LocateRequestMessagingService extends MessagingService {

    private static final String TAG = "LocateRequestFCM";

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);
        String type = remoteMessage.getData().get("type");
        if ("locate_request".equals(type)) {
            handleLocateRequest();
        } else if ("lock_request".equals(type)) {
            handleLockRequest();
        } else if ("unlock_request".equals(type)) {
            handleUnlockRequest();
        } else if ("rest_request".equals(type) || "wake_request".equals(type)) {
            blockerPrefs().edit().putBoolean(AppBlockerPlugin.KEY_RESTING, "rest_request".equals(type)).apply();
            bringForwardForPolicy();
        } else if ("free_request".equals(type)) {
            long until = 0L;
            try {
                until = Long.parseLong(remoteMessage.getData().get("until"));
            } catch (NumberFormatException ignored) {
                // A malformed value ends free time rather than granting some unknown amount.
            }
            blockerPrefs().edit().putLong(AppBlockerPlugin.KEY_UNRESTRICTED_UNTIL, until).apply();
            bringForwardForPolicy();
        }
    }

    private SharedPreferences blockerPrefs() {
        return getSharedPreferences(AppBlockerPlugin.PREFS_NAME, Context.MODE_PRIVATE);
    }

    /** The prefs above already enforce it (ChipperlyBlockService); this brings Chipperly up to show it and fix the pin (MainActivity.applyPinPolicy). */
    private void bringForwardForPolicy() {
        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        intent.putExtra(MainActivity.EXTRA_POLICY_CHANGED, true);
        startActivity(intent);
    }

    private void handleLockRequest() {
        ChipperlyBlockService.syncLockTaskAllowlist(this);
        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        intent.putExtra(MainActivity.EXTRA_LOCK_REQUESTED, true);
        startActivity(intent);
    }

    private void handleUnlockRequest() {
        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        intent.putExtra(MainActivity.EXTRA_UNLOCK_REQUESTED, true);
        startActivity(intent);
    }

    private void handleLocateRequest() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED
                && ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            Log.w(TAG, "locate_request received but location permission isn't granted; nothing to report");
            return;
        }

        SharedPreferences prefs = getSharedPreferences(DeviceLocatorPlugin.PREFS_NAME, Context.MODE_PRIVATE);
        String deviceId = prefs.getString(DeviceLocatorPlugin.KEY_DEVICE_ID, null);
        String reportToken = prefs.getString(DeviceLocatorPlugin.KEY_REPORT_TOKEN, null);
        String apiBase = prefs.getString(DeviceLocatorPlugin.KEY_API_BASE, null);
        if (deviceId == null || reportToken == null || apiBase == null) {
            Log.w(TAG, "locate_request received but this device has no report config yet");
            return;
        }

        // HIGH_ACCURACY (GPS-first), not BALANCED_POWER (network/cell-first):
        // this is one explicit, caregiver-triggered fetch, not a background
        // poll, so the accuracy is worth the extra power draw -- and
        // BALANCED_POWER can return null with no GPS fallback wherever the
        // network provider has nothing to go on (e.g. no real cell data,
        // including every emulator).
        FusedLocationProviderClient client = LocationServices.getFusedLocationProviderClient(this);
        CurrentLocationRequest request = new CurrentLocationRequest.Builder()
                .setPriority(Priority.PRIORITY_HIGH_ACCURACY)
                .setDurationMillis(TimeUnit.SECONDS.toMillis(15))
                .build();

        try {
            // onMessageReceived already runs off the main thread, so blocking
            // here (instead of chaining a listener) is fine and keeps this
            // service alive for the whole fetch-then-report round trip.
            Location location = Tasks.await(
                    client.getCurrentLocation(request, new CancellationTokenSource().getToken()),
                    20, TimeUnit.SECONDS);
            if (location == null) {
                Log.w(TAG, "getCurrentLocation resolved with no location");
                return;
            }
            reportLocation(apiBase, deviceId, reportToken, location);
        } catch (ExecutionException | InterruptedException | TimeoutException e) {
            Log.w(TAG, "Failed to get current location for locate_request", e);
        }
    }

    private void reportLocation(String apiBase, String deviceId, String reportToken, Location location) {
        try {
            JSONObject body = new JSONObject();
            body.put("report_token", reportToken);
            body.put("lat", location.getLatitude());
            body.put("lng", location.getLongitude());
            if (location.hasAccuracy()) body.put("accuracy_m", location.getAccuracy());
            body.put("at", System.currentTimeMillis());

            URL url = new URL(apiBase + "/devices/" + deviceId + "/location");
            HttpURLConnection connection = (HttpURLConnection) url.openConnection();
            try {
                connection.setRequestMethod("POST");
                connection.setRequestProperty("Content-Type", "application/json");
                connection.setDoOutput(true);
                connection.setConnectTimeout((int) TimeUnit.SECONDS.toMillis(10));
                connection.setReadTimeout((int) TimeUnit.SECONDS.toMillis(10));
                try (OutputStream out = connection.getOutputStream()) {
                    out.write(body.toString().getBytes(StandardCharsets.UTF_8));
                }
                int status = connection.getResponseCode();
                if (status >= 400) Log.w(TAG, "Location report rejected, status " + status);
            } finally {
                connection.disconnect();
            }
        } catch (Exception e) {
            Log.w(TAG, "Failed to report location for locate_request", e);
        }
    }
}
