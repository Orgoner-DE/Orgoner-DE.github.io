/* EX-TRIBE PRO 5.2: Web MIDI and native CoreMIDI / Android MIDI bridge.
 * Mapping storage is separate from projects so a new blank session keeps controller assignments.
 */
(()=>{'use strict';
const $=id=>document.getElementById(id), api=window.EXTRIBE_MIDI_API;
const PAD=Array.from({length:16},(_,i)=>({id:`pad${i}`,label:`PAD ${String(i+1).padStart(2,'0')} · TRIGGER`,group:'pads'}));
const MUTE=Array.from({length:16},(_,i)=>({id:`mute${i}`,label:`PAD ${String(i+1).padStart(2,'0')} · MUTE`,group:'mutes'}));
const GLOB=[['play','START / PAUSE'],['stop','STOP'],['bankNext','BANK +'],['bankPrev','BANK −'],['bankA','BANK A'],['bankB','BANK B'],['bankC','BANK C'],['bankD','BANK D'],['master','MASTER LAUTSTÄRKE'],['bpm','TEMPO BPM'],['swing','SWING'],['filter','FILTER'],['delay','DELAY'],['fx','FX EIN / AUS'],['steps','16 / 32 STEPS']].map(([id,label])=>({id,label,group:'global'}));
const TARGETS=[...PAD,...MUTE,...GLOB], TARGET_IDS=new Set(TARGETS.map(t=>t.id));
let mappings=[],channel=0,learnTarget=null,connected=false,backend='none',deviceId='',deviceNames=[],access=null,webConnections=[],lastInput=0,handlers={},learnTimer=null,lastAction=new Map();
const MAPPING_KEY='extribe-midi-mappings-v2',CHANNEL_KEY='extribe-midi-channel-v2';
const clean=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function info(str,ok){$('midiStatus').textContent=str;$('midiDot').classList.toggle('active',!!ok);}
function feedback(text){$('midiLast').textContent=text;$('midiCounter').textContent=`${mappings.length} Zuweisungen`;}
function noteName(x){return ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][x%12]+(Math.floor(x/12)-1)}
function key(m){return `${m.type}:${m.number}:${m.channel}:${m.device||'*'}`}
function mappingLabel(m){if(!m)return 'NICHT BELEGT';return `${m.type==='note'?'NOTE '+noteName(m.number):m.type==='cc'?'CC '+m.number:'PITCH'} · CH ${m.channel}${m.device?' · '+m.device.slice(0,10):''}`;}
function validMapping(m){return m&&TARGET_IDS.has(m.target)&&['note','cc','pitch'].includes(m.type)&&Number.isInteger(m.number)&&m.number>=0&&m.number<=127&&Number.isInteger(m.channel)&&m.channel>=1&&m.channel<=16&&(!m.device||typeof m.device==='string'&&m.device.length<=128)}
function parsePreset(text){const p=JSON.parse(text);if(!p||p.kind!=='EXTRIBE_MIDI_LEARN'||!Array.isArray(p.mappings)||p.mappings.length>160)throw Error('Kein EX-TRIBE MIDI-Preset');const out=[];for(const m of p.mappings){if(!validMapping(m))throw Error('Ungültige MIDI-Zuweisung');if(out.some(x=>x.target===m.target||key(x)===key(m)))throw Error('Doppelte MIDI-Zuweisung');out.push({target:m.target,type:m.type,number:m.number,channel:m.channel,device:m.device||''})}return out;}
function save(){let data=JSON.stringify({kind:'EXTRIBE_MIDI_LEARN',version:2,channel,mappings});try{localStorage.setItem(MAPPING_KEY,data);localStorage.setItem(CHANNEL_KEY,String(channel))}catch{};
 if(window.AndroidMidi?.saveMappings){try{window.AndroidMidi.saveMappings(data)}catch{}}
 if(window.webkit?.messageHandlers?.projectStorage){try{const bridge=window.webkit.messageHandlers.projectStorage;bridge.postMessage({kind:'midiSave',id:Date.now()%1000000000,content:data});}catch{}}
}
async function load(){let raw='';try{raw=localStorage.getItem(MAPPING_KEY)||''}catch{}
 if(window.AndroidMidi?.loadMappings){try{raw=window.AndroidMidi.loadMappings()||raw}catch{}}
 if(raw){try{const p=JSON.parse(raw);mappings=parsePreset(raw);channel=[0,...Array.from({length:16},(_,i)=>i+1)].includes(p.channel)?p.channel:0;}catch(e){console.warn('MIDI-Mappings fehlerhaft',e)}}
 $('midiChannel').value=String(channel);render();
 if(window.webkit?.messageHandlers?.midiBridge)nativeIOS({kind:'loadPreset'});
}
function render(){const root=$('midiMappings');if(!root)return;const titles=[['global','TRANSPORT / MIXER'],['pads','PAD TRIGGER 01–16'],['mutes','MUTE 01–16']];root.replaceChildren();for(const [group,title] of titles){const sec=document.createElement('section');sec.className='midi-group';const h=document.createElement('h3');h.textContent=title;sec.append(h);for(const t of TARGETS.filter(t=>t.group===group)){const m=mappings.find(m=>m.target===t.id),row=document.createElement('div');row.className='midi-map-row'+(m?' active-map':'');row.dataset.target=t.id;const name=document.createElement('span');name.className='midi-map-name';name.textContent=t.label;const signal=document.createElement('span');signal.className='midi-map-signal';signal.textContent=mappingLabel(m);const learn=document.createElement('button');learn.textContent=learnTarget===t.id?'HÖRT…':'LERNEN';learn.className=learnTarget===t.id?'is-learn':'';learn.onclick=()=>learnAction(t.id);const clear=document.createElement('button');clear.className='clear-map';clear.textContent='✕';clear.title='Zuweisung löschen';clear.disabled=!m;clear.onclick=()=>{mappings=mappings.filter(x=>x.target!==t.id);save();render();feedback('Zuweisung gelöscht')};row.append(name,signal,learn,clear);sec.append(row)}root.append(sec)}$('midiCounter').textContent=`${mappings.length} Zuweisungen`;}
function learnAction(target){if(learnTarget===target){cancelLearn();return;}learnTarget=target;$('midiLearning').classList.remove('hidden');$('midiLearning').firstChild.textContent=`LERNT: ${TARGETS.find(x=>x.id===target).label} · Controller bewegen … `;render();clearTimeout(learnTimer);learnTimer=setTimeout(()=>{cancelLearn();feedback('MIDI Learn: Zeit abgelaufen, erneut LERNEN tippen.')},30000);if(!connected)feedback('Bitte zuerst MIDI VERBINDEN und dann Controller bewegen.');}
function cancelLearn(){learnTarget=null;clearTimeout(learnTimer);$('midiLearning').classList.add('hidden');render()}
function assign(target,m){const next={target,type:m.type,number:m.number,channel:m.channel,device:m.device||''};const collision=mappings.find(x=>key(x)===key(next)&&x.target!==target);mappings=mappings.filter(x=>x.target!==target && key(x)!==key(next));mappings.push(next);cancelLearn();save();render();feedback(`${TARGETS.find(t=>t.id===target)?.label}: ${mappingLabel(next)} gelernt${collision?' · Alte Doppelbelegung ersetzt':''}`)}
function run(target,value,type){const p=api.getProject();const now=performance.now();const previous=lastAction.get(target)||0;
 const discrete=type==='note'||target==='play'||target==='stop'||target.startsWith('bank')||target==='fx'||target==='steps'||target.startsWith('mute');
 if(discrete&&now-previous<90)return;lastAction.set(target,now);
 if(target.startsWith('pad')){if(value>0)api.playPad(Number(target.slice(3)));return}
 if(target.startsWith('mute')){if(value>0)api.toggleMute(Number(target.slice(4)));return}
 const on=value>0;
 switch(target){case 'play':if(on)api.togglePlay();break;case 'stop':if(on)api.stopPlayback();break;
 case 'bankNext':if(on)api.setBank((api.getBank()+1)%4);break;
 case 'bankPrev':if(on)api.setBank((api.getBank()+3)%4);break;
 case 'bankA':case 'bankB':case 'bankC':case 'bankD':if(on)api.setBank(target.charCodeAt(4)-65);break;
 case 'fx':if(on){p.fx=!p.fx;api.updateControls();api.setDirty();}break;
 case 'steps':if(on){p.length=p.length===16?32:16;api.stopPlayback();api.updateControls();api.setView('steps');api.setDirty()}break;
 case 'master':p.master=Math.round(value/127*100);api.updateControls();api.setDirty();break;
 case 'bpm':p.bpm=Math.round(40+value/127*200);api.updateControls();api.setDirty();break;
 case 'swing':p.swing=Math.round(value/127*60);api.updateControls();api.setDirty();break;
 case 'filter':p.filter=Math.round(500+Math.pow(value/127,2)*(18000-500));api.updateControls();api.setDirty();break;
 case 'delay':p.delay=Math.round(value/127*35);api.updateControls();api.setDirty();break;}
}
// Parser supports multiple messages, real-time interleaving and running status.
const statusCache=new Map(),pending=new Map();
function processBytes(bytes,device=''){if(!bytes||!bytes.length)return;const dev=String(device||'').slice(0,128);let status=statusCache.get(dev)||0,buffer=pending.get(dev)||[];
 for(const raw of bytes){const b=Number(raw)&255;
 if(b>=0xf8)continue;
 if(b===0xf0 || b===0xf7 || b===0xf1 || b===0xf2 || b===0xf3){status=0;buffer=[];continue;}
 if(b&128){if(b>=0xf0){status=0;buffer=[];continue;}status=b;buffer=[];continue;}
 if(!status)continue;
 const kind=status&0xf0,size=(kind===0xc0||kind===0xd0)?1:2;
 buffer.push(b);if(buffer.length<size)continue;
 if((kind===0x90&&buffer[1]>0)||(kind===0xb0)||(kind===0xe0)){
   const ev={device:dev,channel:(status&15)+1,type:kind===0x90?'note':kind===0xb0?'cc':'pitch',number:kind===0xe0?0:buffer[0],value:kind===0xe0?Math.round(((buffer[1]<<7)+buffer[0])/16383*127):buffer[1]};
   dispatch(ev);
 }
 buffer=[];
 }statusCache.set(dev,status);pending.set(dev,buffer);
}
function dispatch(m){if(!Number.isInteger(m.value))return;lastInput=performance.now();$('midiLast').textContent=`IN: ${m.device||'Controller'} · ${m.type==='note'?'NOTE '+noteName(m.number):m.type==='cc'?'CC '+m.number:'PITCH'} · CH ${m.channel} · ${m.value}`;
 if(channel!==0 && channel!==m.channel)return;
 if(deviceId && m.device && deviceId!==m.device)return;
 if(learnTarget){assign(learnTarget,m);return;}
 for(const assignment of mappings)if(assignment.type===m.type&&assignment.number===m.number&&assignment.channel===m.channel&&(!assignment.device||assignment.device===m.device)){run(assignment.target,m.value,m.type);break;}
}
function updateInputs(names){deviceNames=Array.isArray(names)?names.filter(x=>x&&typeof x.id==='string').slice(0,64):[];
 const sel=$('midiInput'),saved=sel.value||deviceId;sel.replaceChildren();const all=document.createElement('option');all.value='';all.textContent='Alle MIDI-Quellen';sel.append(all);
 for(const item of deviceNames){const e=document.createElement('option');e.value=item.id;e.textContent=item.name||item.id;sel.append(e)}sel.value=deviceNames.some(x=>x.id===saved)?saved:'';deviceId=sel.value;
}
function nativeIOS(message){try{window.webkit.messageHandlers.midiBridge.postMessage(message)}catch(e){info('CoreMIDI: '+e.message,false)}}
async function connect(){cancelLearn();
 if(window.AndroidMidi?.connect){backend='android';try{window.AndroidMidi.connect();connected=true;info('Android MIDI: verbunden',true)}catch(e){info('Android MIDI: '+e.message,false)}return}
 if(window.webkit?.messageHandlers?.midiBridge){backend='ios';nativeIOS({kind:'connect'});connected=true;info('CoreMIDI: Verbindung angefordert',true);return}
 if(!navigator.requestMIDIAccess){backend='none';connected=false;info('Web MIDI nicht verfügbar · native App verwenden',false);return}
 try{access=await navigator.requestMIDIAccess({sysex:false});backend='web';connected=true;bindWeb();access.onstatechange=()=>bindWeb();info('Web MIDI verbunden',true)}catch(e){connected=false;info('MIDI-Zugriff abgelehnt: '+e.message,false)}
}
function bindWeb(){if(!access)return;const inputs=Array.from(access.inputs.values());for(const input of inputs){input.onmidimessage=e=>processBytes(Array.from(e.data),input.id)}updateInputs(inputs.map(x=>({id:x.id,name:x.name||x.manufacturer||'MIDI Controller'})));}
window.EXTRIBE_MIDI_receivePreset=obj=>{try{if(obj?.content){mappings=parsePreset(String(obj.content));const data=JSON.parse(String(obj.content));channel=Number.isInteger(data.channel)&&data.channel>=0&&data.channel<=16?data.channel:0;$('midiChannel').value=String(channel);render();feedback('Native MIDI-Zuweisungen wiederhergestellt');}}catch(e){feedback('Gespeichertes MIDI-Preset ist ungültig')}};
window.EXTRIBE_MIDI_receive=ev=>{if(ev&&Array.isArray(ev.bytes))processBytes(ev.bytes,ev.device||'')};
window.EXTRIBE_MIDI_devices=list=>{updateInputs(list);connected=true;info(list.length?`MIDI bereit · ${list.length} Eingang/Eingänge`:'MIDI bereit · kein Controller gefunden',!!list.length)};
function exportPreset(){const obj={kind:'EXTRIBE_MIDI_LEARN',version:2,channel,mappings,exportedAt:new Date().toISOString()};const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(obj,null,2)],{type:'application/json'}));a.href=url;a.download='EXTRIBE-MIDI-Preset-5.2.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000)}
$('midiConnect').onclick=connect;
$('midiCancel').onclick=cancelLearn;
$('midiInput').onchange=e=>{deviceId=e.target.value;if(backend==='ios')nativeIOS({kind:'select',id:deviceId});else if(backend==='android'&&window.AndroidMidi?.select)window.AndroidMidi.select(deviceId);feedback(deviceId?'MIDI Quelle ausgewählt':'Alle Quellen')};
for(let i=1;i<=16;i++){const o=document.createElement('option');o.value=String(i);o.textContent='Kanal '+i;$('midiChannel').append(o)}
$('midiChannel').onchange=e=>{channel=Number(e.target.value)||0;save();feedback(channel?`MIDI Kanal ${channel} aktiv`:'Alle MIDI-Kanäle aktiv')};
$('midiSave').onclick=exportPreset;
$('midiLoad').onclick=()=>$('midiPresetPicker').click();
$('midiPresetPicker').onchange=async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;try{if(file.size>500000)throw Error('Preset zu groß');mappings=parsePreset(await file.text());save();render();feedback(`${mappings.length} MIDI-Mappings importiert`)}catch(err){feedback('Importfehler: '+err.message)}};
$('midiReset').onclick=()=>{if(!confirm('Alle MIDI-Zuweisungen wirklich löschen?'))return;mappings=[];cancelLearn();save();render();feedback('Alle MIDI-Mappings gelöscht')};
window.EXTRIBE_MIDI={connect,render,dispatch,processBytes,assign,clear:()=>{mappings=[];cancelLearn();save();render()},getMappings:()=>structuredClone(mappings),getStatus:()=>({backend,connected,channel,deviceId,mappings:mappings.length}),setMappings:p=>{mappings=parsePreset(JSON.stringify({kind:'EXTRIBE_MIDI_LEARN',mappings:p}));save();render()}};
load().then(()=>{feedback('MIDI-Learn bereit · Controller verbinden')});
})();
