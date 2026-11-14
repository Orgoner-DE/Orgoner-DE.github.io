package de.orgoner.bap50;

import android.app.Activity;
import android.content.Context;
import android.media.midi.MidiDevice;
import android.media.midi.MidiDeviceInfo;
import android.media.midi.MidiManager;
import android.media.midi.MidiOutputPort;
import android.media.midi.MidiReceiver;
import android.os.Handler;
import android.os.Looper;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.IOException;
import java.util.ArrayList;

/** USB-/System-MIDI-Eingang über android.media.midi, weitergereicht an window.BAP_midi(bytes). */
public final class MidiBridge {
    private final Activity activity;
    private final WebView web;
    private final MidiManager manager;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ArrayList<MidiDevice> devices = new ArrayList<>();
    private final ArrayList<MidiOutputPort> ports = new ArrayList<>();
    private boolean active = false;
    private volatile boolean destroyed = false;
    private int generation = 0;

    private final MidiManager.DeviceCallback callback = new MidiManager.DeviceCallback() {
        @Override public void onDeviceAdded(MidiDeviceInfo info) { if (active) connectInternal(); }
        @Override public void onDeviceRemoved(MidiDeviceInfo info) { if (active) connectInternal(); }
    };

    public MidiBridge(Activity a, WebView w) {
        activity = a;
        web = w;
        manager = (MidiManager) a.getSystemService(Context.MIDI_SERVICE);
    }

    @JavascriptInterface
    public boolean available() { return manager != null; }

    @JavascriptInterface
    public void connect() { activity.runOnUiThread(this::connectInternal); }

    private void js(String code) {
        activity.runOnUiThread(() -> { if (!destroyed) web.evaluateJavascript(code, null); });
    }

    private void connectInternal() {
        if (destroyed || manager == null) return;
        if (!active) { active = true; manager.registerDeviceCallback(callback, handler); }
        generation++;
        final int gen = generation;
        for (MidiOutputPort p : ports) { try { p.close(); } catch (IOException ignored) { } }
        ports.clear();
        for (MidiDevice d : devices) { try { d.close(); } catch (IOException ignored) { } }
        devices.clear();
        JSONArray list = new JSONArray();
        for (MidiDeviceInfo info : manager.getDevices()) {
            if (info.getOutputPortCount() < 1) continue;
            try {
                String name = info.getProperties().getString(MidiDeviceInfo.PROPERTY_NAME);
                list.put(new JSONObject().put("id", String.valueOf(info.getId())).put("name", name != null ? name : "MIDI #" + info.getId()));
            } catch (Exception ignored) { }
            manager.openDevice(info, device -> {
                if (device == null || destroyed || gen != generation) {
                    if (device != null) try { device.close(); } catch (IOException ignored) { }
                    return;
                }
                devices.add(device);
                for (int i = 0; i < info.getOutputPortCount(); i++) {
                    MidiOutputPort port = device.openOutputPort(i);
                    if (port == null) continue;
                    ports.add(port);
                    port.connect(new MidiReceiver() {
                        @Override
                        public void onSend(byte[] data, int offset, int count, long timestamp) {
                            if (destroyed || count <= 0 || count > 4096) return;
                            StringBuilder sb = new StringBuilder("window.BAP_midi && window.BAP_midi([");
                            for (int k = 0; k < count; k++) { if (k > 0) sb.append(','); sb.append(data[offset + k] & 255); }
                            sb.append("])");
                            js(sb.toString());
                        }
                    });
                }
            }, handler);
        }
        js("window.BAP_midiDevices && window.BAP_midiDevices(" + list + ")");
    }

    public void close() {
        destroyed = true;
        generation++;
        if (active && manager != null) manager.unregisterDeviceCallback(callback);
        for (MidiOutputPort p : ports) { try { p.close(); } catch (IOException ignored) { } }
        ports.clear();
        for (MidiDevice d : devices) { try { d.close(); } catch (IOException ignored) { } }
        devices.clear();
    }
}
