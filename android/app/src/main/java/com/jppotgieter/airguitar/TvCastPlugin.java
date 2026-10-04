package com.jppotgieter.airguitar;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.provider.Settings;
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
        Settings.ACTION_DISPLAY_SETTINGS,
    };

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
        call.reject("This phone has no cast settings screen");
    }
}
