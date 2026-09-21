package org.chipperly.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(KioskPlugin.class);
        registerPlugin(AppBlockerPlugin.class);
        registerPlugin(DeviceLocatorPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
