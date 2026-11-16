package de.orgoner.djdeckpro4;

import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Base64;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;
import java.io.IOException;
import java.io.OutputStream;

/** DJ DECK PRO 4 – native Android-Hülle. Die Web-App liegt in den APK-Assets und wird über
 *  https://appassets.androidplatform.net geladen (sicherer Kontext für AudioWorklet und IndexedDB). */
public final class MainActivity extends Activity {
    private static final int PICK_FILE = 2001;
    private static final int SAVE_FILE = 2002;
    private WebView web;
    private MidiBridge midiBridge;
    private ValueCallback<Uri[]> chooser;
    private OutputStream out;
    private boolean receiving, waitingForSave;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().setStatusBarColor(Color.rgb(10, 12, 16));
        getWindow().setNavigationBarColor(Color.rgb(10, 12, 16));
        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(10, 12, 16));
        setContentView(web);
        immersive();
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setSupportMultipleWindows(false);
        s.setUserAgentString(s.getUserAgentString() + " DJDeckPro4App/4.0.0");
        web.addJavascriptInterface(new ExportBridge(), "AndroidExport");
        midiBridge = new MidiBridge(this, web);
        web.addJavascriptInterface(midiBridge, "AndroidMidi");
        web.setWebViewClient(new WebViewClientCompat() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) { return loader.shouldInterceptRequest(r.getUrl()); }
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if ("appassets.androidplatform.net".equals(u.getHost())) return false;
                if ("https".equals(u.getScheme())) { try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) {} }
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (chooser != null) chooser.onReceiveValue(null);
                chooser = cb;
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                String[] types = p.getAcceptTypes();
                boolean json = types != null && types.length > 0 && types[0] != null && types[0].contains("json");
                i.setType(json ? "*/*" : "audio/*");
                if (!json) i.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"audio/*", "video/mp4", "video/webm", "application/ogg", "application/octet-stream"});
                i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, p.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
                try { startActivityForResult(i, PICK_FILE); return true; }
                catch (Exception e) { chooser.onReceiveValue(null); chooser = null; return false; }
            }
        });
        if (state != null) web.restoreState(state);
        else web.loadUrl("https://appassets.androidplatform.net/assets/index.html");
    }

    private void immersive() {
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) { c.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars()); c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE); }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
        }
    }
    @Override public void onWindowFocusChanged(boolean f) { super.onWindowFocusChanged(f); if (f) immersive(); }
    @Override protected void onSaveInstanceState(Bundle b) { super.onSaveInstanceState(b); if (web != null) web.saveState(b); }

    private synchronized void closeOutput() {
        receiving = false; waitingForSave = false;
        if (out != null) { try { out.close(); } catch (IOException ignored) {} out = null; }
    }
    private void notifySaveReady(boolean ready) {
        runOnUiThread(() -> { if (web != null) web.evaluateJavascript("window.__nativeExportReady && window.__nativeExportReady(" + ready + ")", null); });
    }
    @Override protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req == PICK_FILE) {
            if (chooser == null) return;
            Uri[] uris = null;
            if (res == RESULT_OK && data != null) {
                ClipData clip = data.getClipData();
                if (clip != null) { uris = new Uri[clip.getItemCount()]; for (int i = 0; i < uris.length; i++) uris[i] = clip.getItemAt(i).getUri(); }
                else if (data.getData() != null) uris = new Uri[]{data.getData()};
            }
            chooser.onReceiveValue(uris); chooser = null;
        } else if (req == SAVE_FILE) {
            boolean ready = false;
            synchronized (this) {
                if (waitingForSave && res == RESULT_OK && data != null && data.getData() != null) {
                    try { out = getContentResolver().openOutputStream(data.getData(), "w"); receiving = out != null; ready = receiving; }
                    catch (Exception e) { closeOutput(); }
                } else closeOutput();
                waitingForSave = false;
            }
            notifySaveReady(ready);
        }
    }

    /** Speichern von Aufnahmen/Exporten über den Android-Speicherdialog (Base64-Blöcke aus JS). */
    private final class ExportBridge {
        @JavascriptInterface public void beginExport(String name, String mime) {
            String n = name == null ? "DJ-DECK-PRO-Export" : name.replaceAll("[^A-Za-z0-9._-]", "_");
            if (n.isEmpty()) n = "DJ-DECK-PRO-Export";
            if (n.length() > 120) n = n.substring(0, 120);
            final String fn = n;
            final String type = mime != null && mime.matches("[a-zA-Z0-9.+_-]+/[a-zA-Z0-9.+_-]+") ? mime : "application/octet-stream";
            runOnUiThread(() -> {
                closeOutput(); waitingForSave = true;
                Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE); i.setType(type); i.putExtra(Intent.EXTRA_TITLE, fn);
                try { startActivityForResult(i, SAVE_FILE); } catch (Exception e) { closeOutput(); notifySaveReady(false); }
            });
        }
        @JavascriptInterface public boolean writeChunk(String b64) {
            if (b64 == null || b64.length() > 65536) return false;
            synchronized (MainActivity.this) {
                if (!receiving || out == null) return false;
                try { out.write(Base64.decode(b64, Base64.DEFAULT)); return true; } catch (Exception e) { closeOutput(); return false; }
            }
        }
        @JavascriptInterface public void endExport() {
            synchronized (MainActivity.this) { closeOutput(); }
            runOnUiThread(() -> Toast.makeText(MainActivity.this, "Gespeichert", Toast.LENGTH_SHORT).show());
        }
        @JavascriptInterface public void abortExport() { synchronized (MainActivity.this) { closeOutput(); } }
    }

    @Override public void onBackPressed() {
        if (web != null) web.evaluateJavascript("(function(){var m=document.querySelector('.modal');if(m){m.remove();return 1}return 0})()", v -> { if (!"1".equals(v)) moveTaskToBack(true); });
        else super.onBackPressed();
    }
    @Override protected void onDestroy() {
        closeOutput();
        if (chooser != null) { chooser.onReceiveValue(null); chooser = null; }
        if (midiBridge != null) { midiBridge.close(); midiBridge = null; }
        if (web != null) { web.destroy(); web = null; }
        super.onDestroy();
    }
}
