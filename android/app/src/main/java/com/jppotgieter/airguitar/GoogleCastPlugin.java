package com.jppotgieter.airguitar;

import android.util.Log;
import androidx.mediarouter.app.MediaRouteChooserDialog;
import androidx.mediarouter.app.MediaRouteControllerDialog;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.cast.CastDevice;
import com.google.android.gms.cast.framework.CastContext;
import com.google.android.gms.cast.framework.CastSession;
import com.google.android.gms.cast.framework.CastState;
import com.google.android.gms.cast.framework.CastStateListener;
import com.google.android.gms.cast.framework.SessionManagerListener;

/**
 * Google Cast for Air Guitar Hero: finds Chromecasts, shows the standard device picker,
 * launches the TV app (see web/tv.html) and sends it the player's moves and notes over a
 * custom message channel. Events to the web app: "castState".
 */
@CapacitorPlugin(name = "GoogleCast")
public class GoogleCastPlugin extends Plugin {

    private static final String TAG = "GoogleCast";
    static final String NAMESPACE = "urn:x-cast:com.jppotgieter.airguitar";

    private CastContext castContext;
    private CastSession session;
    private String phase = "idle"; // idle | connecting | connected

    private final CastStateListener castStateListener = state -> emitState();

    private final SessionManagerListener<CastSession> sessionListener = new SessionManagerListener<CastSession>() {
        @Override
        public void onSessionStarting(CastSession s) {
            phase = "connecting";
            emitState();
        }

        @Override
        public void onSessionStarted(CastSession s, String sessionId) {
            session = s;
            phase = "connected";
            emitState();
        }

        @Override
        public void onSessionStartFailed(CastSession s, int error) {
            session = null;
            phase = "idle";
            emitState();
        }

        @Override
        public void onSessionEnding(CastSession s) {}

        @Override
        public void onSessionEnded(CastSession s, int error) {
            session = null;
            phase = "idle";
            emitState();
        }

        @Override
        public void onSessionResuming(CastSession s, String sessionId) {
            phase = "connecting";
            emitState();
        }

        @Override
        public void onSessionResumed(CastSession s, boolean wasSuspended) {
            session = s;
            phase = "connected";
            emitState();
        }

        @Override
        public void onSessionResumeFailed(CastSession s, int error) {
            session = null;
            phase = "idle";
            emitState();
        }

        @Override
        public void onSessionSuspended(CastSession s, int reason) {
            phase = "connecting";
            emitState();
        }
    };

    private boolean configured() {
        String id = getContext().getString(R.string.cast_app_id);
        return id != null && !id.trim().isEmpty();
    }

    @Override
    public void load() {
        if (!configured()) {
            Log.i(TAG, "No Cast app ID set (res/values/strings.xml: cast_app_id); casting disabled");
            return;
        }
        getActivity()
            .runOnUiThread(() -> {
                try {
                    castContext = CastContext.getSharedInstance(getContext());
                    castContext.addCastStateListener(castStateListener);
                    castContext.getSessionManager().addSessionManagerListener(sessionListener, CastSession.class);
                    CastSession current = castContext.getSessionManager().getCurrentCastSession();
                    if (current != null && current.isConnected()) {
                        session = current;
                        phase = "connected";
                    }
                    emitState();
                } catch (Exception e) {
                    // No Google Play services (or Cast unavailable) on this phone.
                    Log.w(TAG, "Cast unavailable", e);
                    castContext = null;
                }
            });
    }

    private JSObject state() {
        JSObject s = new JSObject();
        s.put("configured", configured());
        boolean ready = castContext != null;
        s.put("available", ready && castContext.getCastState() != CastState.NO_DEVICES_AVAILABLE);
        s.put("state", phase);
        String device = "";
        if (session != null) {
            CastDevice d = session.getCastDevice();
            if (d != null) device = d.getFriendlyName();
        }
        s.put("device", device);
        return s;
    }

    private void emitState() {
        notifyListeners("castState", state());
    }

    @PluginMethod
    public void getState(PluginCall call) {
        getActivity().runOnUiThread(() -> call.resolve(state()));
    }

    /** The standard Cast picker: choose a TV, or (when casting) see it and stop. */
    @PluginMethod
    public void showPicker(PluginCall call) {
        getActivity()
            .runOnUiThread(() -> {
                if (castContext == null) {
                    call.reject("Casting isn't available on this phone");
                    return;
                }
                try {
                    if (session != null && session.isConnected()) {
                        new MediaRouteControllerDialog(getActivity()).show();
                    } else {
                        MediaRouteChooserDialog dialog = new MediaRouteChooserDialog(getActivity());
                        dialog.setRouteSelector(castContext.getMergedSelector());
                        dialog.show();
                    }
                    call.resolve();
                } catch (Exception e) {
                    call.reject("Couldn't open the cast picker", e);
                }
            });
    }

    /** Sends one JSON message to the TV app. Fire-and-forget: frames go out ~30 times a second. */
    @PluginMethod
    public void send(PluginCall call) {
        String message = call.getString("message");
        getActivity()
            .runOnUiThread(() -> {
                if (session == null || !session.isConnected() || message == null) {
                    call.resolve();
                    return;
                }
                try {
                    session.sendMessage(NAMESPACE, message);
                } catch (Exception e) {
                    Log.w(TAG, "send failed", e);
                }
                call.resolve();
            });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getActivity()
            .runOnUiThread(() -> {
                if (castContext != null) castContext.getSessionManager().endCurrentSession(true);
                call.resolve();
            });
    }
}
