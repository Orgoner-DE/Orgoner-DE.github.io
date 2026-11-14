package de.orgoner.bap50;

import android.Manifest;
import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Base64;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * BAP-50 als Android-App: die Web-App liegt in assets/www und wird über eine
 * virtuelle HTTPS-Adresse ausgeliefert (ES-Module, fetch, IndexedDB funktionieren so wie im Browser).
 */
public final class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String START = "https://" + HOST + "/index.html";
    private static final int PICK_FILE = 1001;
    private static final int SAVE_FILE = 1002;
    private static final int MIC_PERMISSION = 1003;

    private WebView web;
    private MidiBridge midi;
    private ValueCallback<Uri[]> chooser;
    private PermissionRequest pendingMic;
    private OutputStream out;
    private boolean receiving;
    private boolean waitingForSave;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().setStatusBarColor(Color.rgb(20, 19, 23));
        getWindow().setNavigationBarColor(Color.rgb(20, 19, 23));

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(14, 13, 16));
        root.setOnApplyWindowInsetsListener((View v, WindowInsets insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            } else {
                v.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                        insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            }
            return insets;
        });
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(14, 13, 16));
        root.addView(web, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);

        WebView.setWebContentsDebuggingEnabled(false);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        s.setSupportMultipleWindows(false);
        s.setTextZoom(100);

        web.addJavascriptInterface(new ExportBridge(), "BapNative");
        midi = new MidiBridge(this, web);
        web.addJavascriptInterface(midi, "BapMidi");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (HOST.equals(url.getHost())) return false;
                if ("https".equals(url.getScheme())) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, url)); } catch (Exception ignored) { }
                }
                return true;
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (!HOST.equals(url.getHost())) return null; // z. B. Webfonts: normal laden
                return serveAsset(url.getPath());
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (chooser != null) chooser.onReceiveValue(null);
                chooser = callback;
                Intent intent;
                try { intent = params.createIntent(); }
                catch (Exception e) { intent = new Intent(Intent.ACTION_GET_CONTENT).setType("*/*"); }
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                try {
                    startActivityForResult(intent, PICK_FILE);
                    return true;
                } catch (Exception ex) {
                    chooser = null;
                    return false;
                }
            }

            @Override
            public void onPermissionRequest(PermissionRequest request) {
                boolean audio = false;
                for (String r : request.getResources()) if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r)) audio = true;
                if (!audio) { request.deny(); return; }
                runOnUiThread(() -> {
                    if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                        request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
                    } else {
                        if (pendingMic != null) pendingMic.deny();
                        pendingMic = request;
                        requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, MIC_PERMISSION);
                    }
                });
            }
        });

        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl(START);
    }

    private static final Map<String, String> MIME = new HashMap<>();
    static {
        MIME.put("html", "text/html");
        MIME.put("css", "text/css");
        MIME.put("js", "text/javascript");
        MIME.put("json", "application/json");
        MIME.put("webmanifest", "application/manifest+json");
        MIME.put("wav", "audio/wav");
        MIME.put("svg", "image/svg+xml");
        MIME.put("png", "image/png");
    }

    private WebResourceResponse serveAsset(String path) {
        if (path == null || path.isEmpty() || "/".equals(path)) path = "/index.html";
        if (path.contains("..")) return notFound();
        String ext = path.substring(path.lastIndexOf('.') + 1).toLowerCase();
        String mime = MIME.containsKey(ext) ? MIME.get(ext) : "application/octet-stream";
        try {
            InputStream in = getAssets().open("www" + path);
            boolean text = mime.startsWith("text/") || mime.contains("json") || mime.contains("svg");
            WebResourceResponse r = new WebResourceResponse(mime, text ? "utf-8" : null, in);
            Map<String, String> headers = new HashMap<>();
            headers.put("Cache-Control", "no-cache");
            headers.put("Access-Control-Allow-Origin", "https://" + HOST);
            r.setResponseHeaders(headers);
            return r;
        } catch (IOException e) {
            return notFound();
        }
    }

    private static WebResourceResponse notFound() {
        return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", new HashMap<>(), new ByteArrayInputStream(new byte[0]));
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode != MIC_PERMISSION || pendingMic == null) return;
        if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) {
            pendingMic.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
        } else {
            pendingMic.deny();
        }
        pendingMic = null;
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == PICK_FILE) {
            if (chooser == null) return;
            Uri[] uris = null;
            if (resultCode == RESULT_OK && data != null) {
                ClipData clip = data.getClipData();
                if (clip != null) {
                    uris = new Uri[clip.getItemCount()];
                    for (int i = 0; i < uris.length; i++) uris[i] = clip.getItemAt(i).getUri();
                } else if (data.getData() != null) {
                    uris = new Uri[]{data.getData()};
                }
            }
            chooser.onReceiveValue(uris);
            chooser = null;
        } else if (requestCode == SAVE_FILE) {
            boolean ready = false;
            synchronized (this) {
                if (waitingForSave && resultCode == RESULT_OK && data != null && data.getData() != null) {
                    try {
                        out = getContentResolver().openOutputStream(data.getData(), "w");
                        receiving = out != null;
                        ready = receiving;
                    } catch (Exception ignored) {
                        closeOutput();
                    }
                } else {
                    closeOutput();
                }
                waitingForSave = false;
            }
            final boolean ok = ready;
            runOnUiThread(() -> { if (web != null) web.evaluateJavascript("window.__bapSaveReady && window.__bapSaveReady(" + ok + ")", null); });
        }
    }

    private synchronized void closeOutput() {
        receiving = false;
        waitingForSave = false;
        if (out != null) {
            try { out.close(); } catch (IOException ignored) { }
            out = null;
        }
    }

    /** Speichern von WAV-/JSON-Exporten über den System-Dateidialog. */
    private final class ExportBridge {
        @JavascriptInterface
        public void beginExport(String name, String mime) {
            String n = name == null ? "BAP-50-Export" : name.replaceAll("[^A-Za-z0-9._ -]", "_");
            if (n.isEmpty()) n = "BAP-50-Export";
            if (n.length() > 110) n = n.substring(0, 110);
            String type = mime != null && mime.matches("[a-zA-Z0-9.+_-]+/[a-zA-Z0-9.+_-]+") ? mime : "application/octet-stream";
            final String fileName = n;
            runOnUiThread(() -> {
                closeOutput();
                waitingForSave = true;
                Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType(type);
                i.putExtra(Intent.EXTRA_TITLE, fileName);
                try {
                    startActivityForResult(i, SAVE_FILE);
                } catch (Exception ex) {
                    closeOutput();
                    if (web != null) web.evaluateJavascript("window.__bapSaveReady && window.__bapSaveReady(false)", null);
                }
            });
        }

        @JavascriptInterface
        public boolean writeChunk(String encoded) {
            if (encoded == null || encoded.length() > 65536) return false;
            synchronized (MainActivity.this) {
                if (!receiving || out == null) return false;
                try {
                    out.write(Base64.decode(encoded, Base64.DEFAULT));
                    return true;
                } catch (Exception e) {
                    closeOutput();
                    return false;
                }
            }
        }

        @JavascriptInterface
        public void endExport() {
            synchronized (MainActivity.this) { closeOutput(); }
            runOnUiThread(() -> Toast.makeText(MainActivity.this, "Gespeichert", Toast.LENGTH_SHORT).show());
        }

        @JavascriptInterface
        public void abortExport() {
            synchronized (MainActivity.this) { closeOutput(); }
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (web != null) web.saveState(outState);
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (web != null) web.evaluateJavascript("window.__bapPause && window.__bapPause()", null);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.evaluateJavascript("window.__bapResume && window.__bapResume()", null);
    }

    @Override
    protected void onDestroy() {
        closeOutput();
        if (chooser != null) { chooser.onReceiveValue(null); chooser = null; }
        if (pendingMic != null) { pendingMic.deny(); pendingMic = null; }
        if (midi != null) { midi.close(); midi = null; }
        if (web != null) { web.destroy(); web = null; }
        super.onDestroy();
    }
}
