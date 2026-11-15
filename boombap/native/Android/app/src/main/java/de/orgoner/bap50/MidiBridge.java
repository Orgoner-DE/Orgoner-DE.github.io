package de.orgoner.bap50;

import android.app.Activity;
import android.content.Context;
import android.media.midi.MidiDevice;
import android.media.midi.MidiDeviceInfo;
import android.media.midi.MidiInputPort;
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
import java.util.concurrent.ConcurrentHashMap;

/**
 * USB-/System-MIDI über android.media.midi.
 * Eingang: window.BAP_midi(bytes, deviceId, port). Ausgang: BapMidi.send(deviceId, "b1,b2,…") an Port 0 des Geräts
 * (z. B. LED-Rückmeldung für Grid-Controller).
 */
public final class MidiBridge {
    private final Activity activity;
    private final WebView web;
    private final MidiManager manager;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ArrayList<MidiDevice> devices = new ArrayList<>();
    private final ArrayList<MidiOutputPort> ports = new ArrayList<>();
    private final ConcurrentHashMap<String, MidiInputPort> sinks = new ConcurrentHashMap<>();
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

    /** Sendet Bytes (Komma-getrennt, 0–255) an den ersten MIDI-Eingang des Geräts. */
    @JavascriptInterface
    public boolean send(String deviceId, String csv) {
        MidiInputPort port = deviceId != null ? sinks.get(deviceId) : null;
        if (port == null || csv == null || csv.isEmpty()) return false;
        String[] parts = csv.split(",");
        if (parts.length > 8192) return false;
        byte[] buf = new byte[parts.length];
        try {
            for (int i = 0; i < parts.length; i++) buf[i] = (byte) (Integer.parseInt(parts[i].trim()) & 255);
            // in Blöcken senden, damit der USB-Puffer nicht überläuft
            for (int off = 0; off < buf.length; off += 192) port.send(buf, off, Math.min(192, buf.length - off));
            return true;
        } catch (Exception e) {
            return false;
        }
    }

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
        for (MidiInputPort p : sinks.values()) { try { p.close(); } catch (IOException ignored) { } }
        sinks.clear();
        for (MidiDevice d : devices) { try { d.close(); } catch (IOException ignored) { } }
        devices.clear();
        JSONArray list = new JSONArray();
        for (MidiDeviceInfo info : manager.getDevices()) {
            if (info.getOutputPortCount() < 1 && info.getInputPortCount() < 1) continue;
            final String devId = String.valueOf(info.getId());
            try {
                String name = info.getProperties().getString(MidiDeviceInfo.PROPERTY_NAME);
                if (name == null) name = info.getProperties().getString(MidiDeviceInfo.PROPERTY_PRODUCT);
                list.put(new JSONObject().put("id", devId).put("name", name != null ? name : "MIDI #" + info.getId())
                        .put("ins", info.getInputPortCount()).put("outs", info.getOutputPortCount()));
            } catch (Exception ignored) { }
            manager.openDevice(info, device -> {
                if (device == null || destroyed || gen != generation) {
                    if (device != null) try { device.close(); } catch (IOException ignored) { }
                    return;
                }
                devices.add(device);
                if (info.getInputPortCount() > 0) {
                    MidiInputPort sink = device.openInputPort(0);
                    if (sink != null) {
                        sinks.put(devId, sink);
                        js("window.BAP_midiReady && window.BAP_midiReady('" + devId + "')");
                    }
                }
                for (int i = 0; i < info.getOutputPortCount(); i++) {
                    final int portNo = i;
                    MidiOutputPort port = device.openOutputPort(i);
                    if (port == null) continue;
                    ports.add(port);
                    port.connect(new MidiReceiver() {
                        @Override
                        public void onSend(byte[] data, int offset, int count, long timestamp) {
                            if (destroyed || count <= 0 || count > 4096) return;
                            StringBuilder sb = new StringBuilder("window.BAP_midi && window.BAP_midi([");
                            for (int k = 0; k < count; k++) { if (k > 0) sb.append(','); sb.append(data[offset + k] & 255); }
                            sb.append("],'").append(devId).append("',").append(portNo).append(")");
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
        for (MidiInputPort p : sinks.values()) { try { p.close(); } catch (IOException ignored) { } }
        sinks.clear();
        for (MidiDevice d : devices) { try { d.close(); } catch (IOException ignored) { } }
        devices.clear();
    }
}
