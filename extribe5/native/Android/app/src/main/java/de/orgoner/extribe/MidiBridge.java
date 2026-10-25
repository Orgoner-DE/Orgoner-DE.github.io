package de.orgoner.extribe;

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
import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;

/** MIDI input from Android's system MIDI service. No Bluetooth scanning or microphone access. */
public final class MidiBridge {
    private final Activity activity;
    private final WebView web;
    private final MidiManager manager;
    private final Handler handler=new Handler(Looper.getMainLooper());
    private final ArrayList<MidiDevice> devices=new ArrayList<>();
    private final ArrayList<MidiOutputPort> ports=new ArrayList<>();
    private boolean active=false, destroyed=false;
    private volatile String selected="";
    private int generation=0;
    private final MidiManager.DeviceCallback callback=new MidiManager.DeviceCallback(){
        @Override public void onDeviceAdded(MidiDeviceInfo info){if(active)connectInternal();}
        @Override public void onDeviceRemoved(MidiDeviceInfo info){if(active)connectInternal();}
    };
    public MidiBridge(Activity a,WebView w){activity=a;web=w;manager=(MidiManager)a.getSystemService(Context.MIDI_SERVICE);}
    @JavascriptInterface public void connect(){activity.runOnUiThread(this::connectInternal);}
    @JavascriptInterface public void select(String id){selected=id==null?"":id.substring(0,Math.min(id.length(),128));}
    @JavascriptInterface public boolean saveMappings(String content){
        if(content==null||content.length()>150000)return false;
        try{File folder=activity.getFilesDir();File tmp=new File(folder,"midi-learn.tmp"),dst=new File(folder,"midi-learn.json");
          Files.write(tmp.toPath(),content.getBytes(StandardCharsets.UTF_8));
          try{Files.move(tmp.toPath(),dst.toPath(),java.nio.file.StandardCopyOption.REPLACE_EXISTING,java.nio.file.StandardCopyOption.ATOMIC_MOVE);}catch(java.nio.file.AtomicMoveNotSupportedException e){Files.move(tmp.toPath(),dst.toPath(),java.nio.file.StandardCopyOption.REPLACE_EXISTING);}
          return true;
        }catch(Exception e){return false;}
    }
    @JavascriptInterface public String loadMappings(){
        try{File f=new File(activity.getFilesDir(),"midi-learn.json");if(!f.isFile()||f.length()>150000)return "";return new String(Files.readAllBytes(f.toPath()),StandardCharsets.UTF_8);}catch(Exception e){return "";}
    }
    private void pushDevices(){
        if(destroyed)return;
        JSONArray result=new JSONArray();
        if(manager!=null)for(MidiDeviceInfo info:manager.getDevices()){
            try{JSONObject item=new JSONObject();item.put("id",String.valueOf(info.getId()));
                String name=info.getProperties().getString(MidiDeviceInfo.PROPERTY_NAME);
                item.put("name",name!=null?name:"MIDI-Controller #"+info.getId());result.put(item);
            }catch(Exception ignored){}
        }
        String json=result.toString();web.evaluateJavascript("window.EXTRIBE_MIDI_devices("+json+")",null);
    }
    private void connectInternal(){
        if(destroyed||manager==null)return;
        if(!active){active=true;manager.registerDeviceCallback(callback,handler);}
        generation++;final int currentGeneration=generation;
        for(MidiOutputPort port:ports){try{port.close();}catch(IOException ignored){}}
        ports.clear();for(MidiDevice d:devices){try{d.close();}catch(IOException ignored){}}devices.clear();
        for(MidiDeviceInfo info:manager.getDevices()){
            if(info.getOutputPortCount()<1)continue;
            manager.openDevice(info,device->{
                if(device==null||destroyed||currentGeneration!=generation){if(device!=null)try{device.close();}catch(IOException ignored){}return;}
                devices.add(device);
                for(int i=0;i<info.getOutputPortCount();i++){
                    MidiOutputPort port=device.openOutputPort(i);if(port==null)continue;ports.add(port);
                    final String id=String.valueOf(info.getId());
                    port.connect(new MidiReceiver(){
                        @Override public void onSend(byte[] data,int offset,int count,long time){
                           if(!selected.isEmpty()&&!selected.equals(id)||destroyed||count<=0||count>4096)return;
                           JSONArray bytes=new JSONArray();for(int k=0;k<count;k++)bytes.put(data[offset+k]&255);
                           try{JSONObject event=new JSONObject();event.put("device",id);event.put("bytes",bytes);
                               final String payload=event.toString();activity.runOnUiThread(()->{if(!destroyed)web.evaluateJavascript("window.EXTRIBE_MIDI_receive("+payload+")",null);});
                           }catch(Exception ignored){}
                        }
                    });
                }
            },handler);
        }
        pushDevices();
    }
    public void close(){destroyed=true;generation++;if(active&&manager!=null)manager.unregisterDeviceCallback(callback);
       for(MidiOutputPort port:ports){try{port.close();}catch(IOException ignored){}}ports.clear();
       for(MidiDevice d:devices){try{d.close();}catch(IOException ignored){}}devices.clear();
    }
}
