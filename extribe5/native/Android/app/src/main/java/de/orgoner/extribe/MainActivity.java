package de.orgoner.extribe;

import android.app.Activity;
import android.content.Intent;
import android.content.ClipData;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import org.json.JSONObject;
import java.net.URL;
import javax.net.ssl.HttpsURLConnection;
import android.widget.Toast;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.File;
import java.nio.file.Files;
import java.nio.charset.StandardCharsets;
import java.io.OutputStream;
import java.util.UUID;

public final class MainActivity extends Activity {
    private static final int PICK_FILE = 1001;
    private static final int SAVE_FILE = 1002;
    private WebView web;
    private MidiBridge midiBridge;
    private ValueCallback<Uri[]> chooser;
    private OutputStream out;
    private boolean receiving;
    private boolean waitingForSave;

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(10, 15, 24));
        getWindow().setNavigationBarColor(Color.rgb(10, 15, 24));
        WebView.setWebContentsDebuggingEnabled(false);
        web = new WebView(this);
        setContentView(web);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        web.addJavascriptInterface(new ExportBridge(), "AndroidExport");
        web.addJavascriptInterface(new ProjectStorage(), "AndroidProjectStorage");
        web.addJavascriptInterface(new UpdateBridge(), "AndroidUpdate");
        midiBridge = new MidiBridge(this, web);
        web.addJavascriptInterface(midiBridge, "AndroidMidi");
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if ("https".equals(url.getScheme()) && allowedUrl(url.toString())) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, url)); } catch (Exception ignored) {}
                }
                return !"file".equals(url.getScheme()) && !"about".equals(url.getScheme());
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                String scheme = request.getUrl().getScheme();
                if ("http".equals(scheme) || "https".equals(scheme)) {
                    return new WebResourceResponse("text/plain", "UTF-8", new ByteArrayInputStream(new byte[0]));
                }
                return null;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (chooser != null) chooser.onReceiveValue(null);
                chooser = callback;
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("*/*");
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
                try { startActivityForResult(intent, PICK_FILE); return true; }
                catch (Exception ex) { chooser.onReceiveValue(null); chooser = null; return false; }
            }
        });
        web.loadUrl("file:///android_asset/index.html");
    }

    private static final String UPDATE_JSON="https://orgoner-de.github.io/extribe5/latest.json";
    private static boolean allowedUrl(String s) {
        try { URL u=new URL(s);return "https".equals(u.getProtocol()) &&
          (("orgoner-de.github.io".equals(u.getHost()) && u.getPath().startsWith("/extribe5/")) ||
          ("github.com".equals(u.getHost()) && u.getPath().startsWith("/Orgoner-DE/")));
        } catch(Exception e) {return false;}
    }
    private final class UpdateBridge {
      @JavascriptInterface public void open(String url) {
        if(!allowedUrl(url))return;
        runOnUiThread(()->{try{startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(url)));}catch(Exception ignored){}});
      }
      @JavascriptInterface public void check(){new Thread(()->{
        HttpsURLConnection c=null;
        try{c=(HttpsURLConnection)new URL(UPDATE_JSON).openConnection();c.setConnectTimeout(6000);c.setReadTimeout(6000);c.setUseCaches(false);
        if(c.getResponseCode()!=200)return;
        java.io.InputStream stream=c.getInputStream();java.io.ByteArrayOutputStream buffer=new java.io.ByteArrayOutputStream();
        byte[] tmp=new byte[2048];int n;while((n=stream.read(tmp))!=-1){if(buffer.size()+n>16384)return;buffer.write(tmp,0,n);}byte[] raw=buffer.toByteArray();
        JSONObject json=new JSONObject(new String(raw,java.nio.charset.StandardCharsets.UTF_8));
        String quoted=JSONObject.quote(json.toString());
        runOnUiThread(()->{if(web!=null)web.evaluateJavascript("window.EXTRIBE_receiveNativeUpdate("+quoted+")",null);});
        }catch(Exception ignored){}finally{if(c!=null)c.disconnect();}
      },"extribe-update").start();}
    }
    private synchronized void closeOutput() {
        receiving = false;
        waitingForSave = false;
        if (out != null) { try { out.close(); } catch (IOException ignored) {} out = null; }
    }
    private void notifySaveReady(boolean ready) {
        runOnUiThread(() -> { if (web != null) web.evaluateJavascript("window.__nativeExportReady(" + ready + ")", null); });
    }
    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == PICK_FILE) {
            if (chooser != null) {
                Uri[] uris = null;
                if(resultCode == RESULT_OK && data != null){
                    ClipData clip = data.getClipData();
                    if(clip != null){
                        uris = new Uri[clip.getItemCount()];
                        for(int i=0;i<uris.length;i++)uris[i]=clip.getItemAt(i).getUri();
                    }else if(data.getData()!=null){uris=new Uri[]{data.getData()};}
                }
                chooser.onReceiveValue(uris);
                chooser = null;
            }
        } else if (requestCode == SAVE_FILE) {
            boolean ready = false;
            synchronized (this) {
                if (waitingForSave && resultCode == RESULT_OK && data != null && data.getData() != null) {
                    try { out = getContentResolver().openOutputStream(data.getData(), "w"); receiving = out != null; ready = receiving; }
                    catch (Exception ignored) { closeOutput(); }
                } else closeOutput();
                waitingForSave = false;
            }
            notifySaveReady(ready);
        }
    }
    private final class ProjectStorage {
        @JavascriptInterface public boolean saveLibrary(String contents) {
            if(contents == null || contents.length() > 45 * 1048576) return false;
            try {
                java.nio.file.Path dst = new File(getFilesDir(), "extribe-user-packs.json").toPath();
                java.nio.file.Path tmp = new File(getFilesDir(), "extribe-user-packs.tmp").toPath();
                Files.write(tmp, contents.getBytes(StandardCharsets.UTF_8));
                try { Files.move(tmp,dst,java.nio.file.StandardCopyOption.REPLACE_EXISTING,java.nio.file.StandardCopyOption.ATOMIC_MOVE); }
                catch(java.nio.file.AtomicMoveNotSupportedException ex){Files.move(tmp,dst,java.nio.file.StandardCopyOption.REPLACE_EXISTING);}
                return true;
            } catch(Exception ex){return false;}
        }
        @JavascriptInterface public String loadLibrary() {
            try {File f=new File(getFilesDir(),"extribe-user-packs.json");if(!f.isFile()||f.length()>45*1048576)return "";return new String(Files.readAllBytes(f.toPath()),StandardCharsets.UTF_8);}
            catch(Exception e){return "";}
        }

        @JavascriptInterface public boolean save(String contents) {
            if (contents == null || contents.length() > 100 * 1048576) return false;
            try { Files.write(new File(getFilesDir(), "extribe-pro-project.json").toPath(), contents.getBytes(StandardCharsets.UTF_8));return true; }
            catch (Exception e) {return false;}
        }
        @JavascriptInterface public String load() {
            try { File f = new File(getFilesDir(), "extribe-pro-project.json"); if (!f.exists() || f.length() > 100 * 1048576) return "";
                return new String(Files.readAllBytes(f.toPath()), StandardCharsets.UTF_8);
            } catch (Exception e) {return "";}
        }
    }
    private final class ExportBridge {
        @JavascriptInterface public void beginExport(String name, String mime) {
            String sanitized = name == null ? "EXTRIBE-Export.json" : name.replaceAll("[^A-Za-z0-9._-]", "_");
            if (sanitized.isEmpty()) sanitized = "EXTRIBE-Export.json";
            if (sanitized.length() > 110) sanitized = sanitized.substring(0, 110);
            String type = mime != null && mime.matches("[a-zA-Z0-9.+_-]+/[a-zA-Z0-9.+_-]+") ? mime : "application/octet-stream";
            final String saveName = sanitized;
            runOnUiThread(() -> {
                closeOutput();
                waitingForSave = true;
                Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType(type);
                i.putExtra(Intent.EXTRA_TITLE, saveName);
                try { startActivityForResult(i, SAVE_FILE); }
                catch (Exception ex) { closeOutput(); notifySaveReady(false); }
            });
        }
        @JavascriptInterface public boolean writeChunk(String encoded) {
            if (encoded == null || encoded.length() > 65536) return false;
            synchronized (MainActivity.this) {
                if (!receiving || out == null) return false;
                try { out.write(Base64.decode(encoded, Base64.DEFAULT)); return true; }
                catch (Exception e) { closeOutput(); return false; }
            }
        }
        @JavascriptInterface public void endExport() {
            synchronized (MainActivity.this) { closeOutput(); }
            runOnUiThread(() -> Toast.makeText(MainActivity.this, "Export gespeichert", Toast.LENGTH_SHORT).show());
        }
        @JavascriptInterface public void abortExport() { synchronized (MainActivity.this) { closeOutput(); } }
    }
    @Override public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack(); else super.onBackPressed();
    }
    @Override protected void onDestroy() {
        closeOutput();
        if (chooser != null) { chooser.onReceiveValue(null); chooser = null; }
        if (midiBridge != null) { midiBridge.close(); midiBridge = null; }
        if (web != null) { web.destroy(); web = null; }
        super.onDestroy();
    }
}
