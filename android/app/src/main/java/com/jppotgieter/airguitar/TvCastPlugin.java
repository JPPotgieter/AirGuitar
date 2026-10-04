package com.jppotgieter.airguitar;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Opens Android's screen-casting picker so the stage can be shown on a TV / Chromecast.
 * Phones name it differently ("Cast", "Smart View", "Screen mirroring"), so try the
 * known settings screens in order.
 */
@CapacitorPlugin(name = "TvCast")
public class TvCastPlugin extends Plugin {

    private static final String[] CAST_SCREENS = {
        "android.settings.CAST_SETTINGS",
        "android.settings.WIFI_DISPLAY_SETTINGS",
    };
    // Samsung phones cast through their Smart View app instead.
    private static final String SAMSUNG_SMART_VIEW = "com.samsung.android.smartmirroring";

    @PluginMethod
    public void openCastSettings(PluginCall call) {
        for (String action : CAST_SCREENS) {
            try {
                getActivity().startActivity(new Intent(action));
                JSObject result = new JSObject();
                result.put("opened", action);
                call.resolve(result);
                return;
            } catch (ActivityNotFoundException ignored) {
                // Not on this phone; try the next one.
            }
        }
        Intent smartView = getContext().getPackageManager().getLaunchIntentForPackage(SAMSUNG_SMART_VIEW);
        if (smartView != null) {
            try {
                getActivity().startActivity(smartView);
                JSObject result = new JSObject();
                result.put("opened", SAMSUNG_SMART_VIEW);
                call.resolve(result);
                return;
            } catch (ActivityNotFoundException ignored) {
                // Fall through to the manual instructions.
            }
        }
        // Better to show the swipe-down tip than an unrelated settings screen.
        call.reject("This phone has no cast settings screen");
    }
}
