package de.orgoner.studio;
import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.widget.Toast;
import java.io.ByteArrayInputStream;
import java.io.OutputStream;
import java.io.IOException;
import java.util.UUID;

public final class MainActivity extends Activity {
  private static final int PICK=314, SAVE=315;
  private final String token=UUID.randomUUID().toString();
  private WebView web;
  private ValueCallback<Uri[]> chooser;
  private OutputStream output;
  private boolean exporting=false;
  @Override public void onCreate(Bundle b){super.onCreate(b);
    web=new WebView(this);setContentView(web);
    WebSettings s=web.getSettings();
    s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);
    s.setAllowFileAccess(true);
    s.setAllowFileAccessFromFileURLs(false);s.setAllowUniversalAccessFromFileURLs(false);
    s.setJavaScriptCanOpenWindowsAutomatically(false);s.setSupportMultipleWindows(false);
    web.addJavascriptInterface(new ExportBridge(),"NativeStudio");
    web.setWebViewClient(new WebViewClient(){
       @Override public void onPageFinished(WebView w,String url){if("file:///android_asset/index.html".equals(url))w.evaluateJavascript("window.__nativeToken='"+token+"';",null);}
       @Override public boolean shouldOverrideUrlLoading(WebView w,WebResourceRequest r){String scheme=r.getUrl().getScheme();return !"file".equals(scheme)&&!"about".equals(scheme);}
       @Override public WebResourceResponse shouldInterceptRequest(WebView w,WebResourceRequest r){
         String scheme=r.getUrl().getScheme();
         if("https".equals(scheme)||"http".equals(scheme))return new WebResourceResponse("text/plain","UTF-8",new ByteArrayInputStream(new byte[0]));
         return null;
       }
    });
    web.setWebChromeClient(new WebChromeClient(){
       @Override public boolean onShowFileChooser(WebView w,ValueCallback<Uri[]> cb,FileChooserParams p){
         if(chooser!=null)chooser.onReceiveValue(null);chooser=cb;
         Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT);
         i.addCategory(Intent.CATEGORY_OPENABLE);i.setType("*/*");
         try{startActivityForResult(i,PICK);}catch(Exception ex){chooser.onReceiveValue(null);chooser=null;return false;}
         return true;
       }
    });
    web.loadUrl("file:///android_asset/index.html");
  }
  private void ack(boolean ready){runOnUiThread(()->{if(web!=null)web.evaluateJavascript("window.__nativeExportReady("+ready+")",null);});}
  @Override protected void onActivityResult(int req,int result,Intent data){super.onActivityResult(req,result,data);
    if(req==PICK){if(chooser!=null){Uri u=result==RESULT_OK&&data!=null?data.getData():null;chooser.onReceiveValue(u==null?null:new Uri[]{u});chooser=null;}}
    else if(req==SAVE){boolean ready=false;if(result==RESULT_OK&&data!=null&&data.getData()!=null)try{
        synchronized(this){output=getContentResolver().openOutputStream(data.getData(),"w");exporting=output!=null;ready=exporting;}
      }catch(Exception ex){closeExport();}else closeExport();ack(ready);}
  }
  private synchronized void closeExport(){exporting=false;if(output!=null){try{output.close();}catch(IOException ignored){}output=null;}}
  final class ExportBridge {
    @JavascriptInterface public void beginExport(String t,String name,String mime){
      if(!token.equals(t))return;
      String fn=name==null?"Export.zip":name.replaceAll("[^a-zA-Z0-9._-]","_");if(fn.length()>90)fn=fn.substring(0,90);if(fn.isEmpty())fn="Export.zip";
      String type=mime!=null&&mime.matches("[a-zA-Z0-9.+_-]+/[a-zA-Z0-9.+_-]+")?mime:"application/octet-stream";
      final String finalName=fn;
      runOnUiThread(()->{closeExport();Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT);i.addCategory(Intent.CATEGORY_OPENABLE);i.setType(type);i.putExtra(Intent.EXTRA_TITLE,finalName);try{startActivityForResult(i,SAVE);}catch(Exception ex){ack(false);}});
    }
    @JavascriptInterface public boolean writeChunk(String t,String encoded){
      if(!token.equals(t)||encoded==null||encoded.length()>75000)return false;
      synchronized(MainActivity.this){if(!exporting||output==null)return false;try{output.write(Base64.decode(encoded,Base64.DEFAULT));return true;}catch(Exception ex){closeExport();return false;}}
    }
    @JavascriptInterface public void finishExport(String t){if(!token.equals(t))return;synchronized(MainActivity.this){closeExport();}runOnUiThread(()->Toast.makeText(MainActivity.this,"Datei gespeichert",Toast.LENGTH_SHORT).show());}
    @JavascriptInterface public void abortExport(String t){if(token.equals(t))synchronized(MainActivity.this){closeExport();}}
  }
  @Override public void onBackPressed(){if(web!=null&&web.canGoBack())web.goBack();else super.onBackPressed();}
  @Override protected void onDestroy(){closeExport();if(web!=null)web.destroy();super.onDestroy();}
}