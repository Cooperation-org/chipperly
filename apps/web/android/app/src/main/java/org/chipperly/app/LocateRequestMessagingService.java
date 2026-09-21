package org.chipperly.app;

import android.Manifest;
import android.content.Context;
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
 * Answers a caregiver's "Locate now" (POST /me/devices/:id/locate in
 * routes/me.ts) with this device's current position, even when Chipperly is
 * fully killed. Runs on FCM's own background thread -- there's no
 * WebView/Activity here, so it talks to Google Play services and the API
 * directly rather than through the (Activity-bound) Capacitor Geolocation
 * plugin, and reads its config from DeviceLocatorPlugin's SharedPreferences
 * rather than the JS session, which isn't reachable from this context.
 */
public class LocateRequestMessagingService extends MessagingService {

    private static final String TAG = "LocateRequestFCM";

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);
        if (!"locate_request".equals(remoteMessage.getData().get("type"))) return;
        handleLocateRequest();
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
