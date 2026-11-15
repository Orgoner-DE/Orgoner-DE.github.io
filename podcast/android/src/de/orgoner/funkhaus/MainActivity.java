package de.orgoner.funkhaus;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.OutputStream;
import java.nio.charset.Charset;

/** Hülle um die Funkhaus-Web-App (assets/www). */
public class MainActivity extends Activity {
    static MainActivity instance;
    private static final String START_URL = "file:///android_asset/www/index.html";
    private static final int REQ_OPEN = 1;
    private static final int REQ_SAVE = 2;

    WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private String pendingSave;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        instance = this;
        web = new WebView(this);
        web.setBackgroundColor(0xff14110f);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(true);
        // Erlaubt der lokalen App, Podcast-Feeds direkt (ohne CORS-Proxy) zu laden.
        s.setAllowFileAccessFromFileURLs(true);
        s.setAllowUniversalAccessFromFileURLs(true);

        web.addJavascriptInterface(new Bridge(), "FunkhausNative");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (url.startsWith("file:")) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                } catch (ActivityNotFoundException e) {
                    Toast.makeText(MainActivity.this, "Kein Browser gefunden", Toast.LENGTH_SHORT).show();
                }
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> cb, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = cb;
                Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                try {
                    startActivityForResult(Intent.createChooser(i, "OPML-Datei wählen"), REQ_OPEN);
                } catch (ActivityNotFoundException e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }
        });

        if (state != null) web.restoreState(state);
        if (web.getUrl() == null) web.loadUrl(START_URL);

        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, 7);
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    // Absichtlich kein web.onPause(): Audio soll im Hintergrund weiterlaufen.

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("window.__fhBack ? window.__fhBack() : false", new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String v) {
                if ("true".equals(v)) return;
                if (web.canGoBack()) web.goBack();
                else moveTaskToBack(true);
            }
        });
    }

    @Override
    protected void onDestroy() {
        if (instance == this) instance = null;
        PlaybackService.shutdown(this);
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    void runJs(final String js) {
        if (web != null) web.evaluateJavascript(js, null);
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req == REQ_OPEN) {
            Uri[] r = null;
            if (res == RESULT_OK && data != null && data.getData() != null) r = new Uri[]{data.getData()};
            if (fileCallback != null) fileCallback.onReceiveValue(r);
            fileCallback = null;
        } else if (req == REQ_SAVE) {
            String content = pendingSave;
            pendingSave = null;
            if (res != RESULT_OK || data == null || data.getData() == null || content == null) return;
            try {
                OutputStream os = getContentResolver().openOutputStream(data.getData());
                os.write(content.getBytes(Charset.forName("UTF-8")));
                os.close();
                Toast.makeText(this, "OPML gespeichert", Toast.LENGTH_SHORT).show();
            } catch (Exception e) {
                Toast.makeText(this, "Speichern fehlgeschlagen: " + e.getMessage(), Toast.LENGTH_LONG).show();
            }
        }
    }

    /** Von JavaScript aus erreichbar als window.FunkhausNative. */
    class Bridge {
        @JavascriptInterface
        public void playback(final boolean playing, final String title, final String podcast) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    PlaybackService.update(MainActivity.this, playing, title, podcast);
                }
            });
        }

        @JavascriptInterface
        public void saveFile(final String name, final String content) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    pendingSave = content;
                    Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                    i.addCategory(Intent.CATEGORY_OPENABLE);
                    i.setType("text/xml");
                    i.putExtra(Intent.EXTRA_TITLE, name);
                    try {
                        startActivityForResult(i, REQ_SAVE);
                    } catch (ActivityNotFoundException e) {
                        pendingSave = null;
                        Toast.makeText(MainActivity.this, "Kein Dateimanager gefunden", Toast.LENGTH_SHORT).show();
                    }
                }
            });
        }
    }
}
