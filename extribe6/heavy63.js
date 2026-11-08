/* EX-TRIBE STUDIO 6.3 | Hybrid chain controller
   Software-only APC mini mk2 mapping. Real USB/CoreMIDI must be verified on a device.
   Processing: input -> mapping -> sequencer/track -> DSP -> bus -> limiter -> output.
*/
(()=>{'use strict';
const $=id=>document.getElementById(id);
const S=()=>window.EXTRIBE_STUDIO60, R=()=>window.EXTRIBE_RACK62;
const STORE='extribe-studio-63-midi';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)||0));
const stamp=()=>new Date().toLocaleTimeString('de-DE',{hour12:false});
const entries=[];let apc=false, mappings=[], learning='',selectedPanel='step',shift=false,page=0,diagOpen=false;
let midiCount=0,hardwareMessages=0,lastDevice='Keine Hardware verbunden',lastCC='',lastAction=0,latencyMs=null;
let lowFPS=0,clipHits=0,lastProtect=0,raf=0,frames=0,fps=60,lastFrame=0,quality='normal',audioTimer=0;
const TARGETS=[{id:'play',name:'▶ Transport Play / Pause'},{id:'stop',name:'■ Transport Stop'},{id:'master',name:'Master-Lautstärke'},{id:'selectedCut',name:'Ausgewählte Spur Filter'},{id:'selectedDrive',name:'Ausgewählte Spur Distortion'},...Array.from({length:8},(_,i)=>({id:'track'+i,name:'Spur '+(i+1)+' auswählen'})),...Array.from({length:8},(_,i)=>({id:'mute'+i,name:'Spur '+(i+1)+' Mute'})),...Array.from({length:8},(_,i)=>({id:'vol'+i,name:'Spur '+(i+1)+' Volume'})),...Array.from({length:16},(_,i)=>({id:'step'+i,name:'Step '+(i+1)+' umschalten'}))];
const TARGET_IDS=new Set(TARGETS.map(x=>x.id));
function safeStorageGet(){try{return JSON.parse(localStorage.getItem(STORE)||'null')}catch{return null}}
function save(){try{localStorage.setItem(STORE,JSON.stringify({version:1,apc,mappings,page,quality}))}catch{log('Speichern','Lokaler Speicher gesperrt',false)}}
function initSaved(){const obj=safeStorageGet();if(obj&&obj.version===1){apc=!!obj.apc;page=obj.page===1?1:0;quality=obj.quality==='eco'?'eco':'normal';mappings=(Array.isArray(obj.mappings)?obj.mappings:[]).filter(x=>TARGET_IDS.has(x.target)&&['note','cc'].includes(x.type)&&Number.isInteger(x.number)&&x.number>=0&&x.number<=127&&x.channel>=1&&x.channel<=16).slice(0,60)}}
function log(stage,info,ok=true){entries.unshift({at:stamp(),stage,info,ok});if(entries.length>40)entries.pop();const root=$('ex63-log');if(root&&diagOpen)root.textContent=entries.slice(0,14).map(x=>`${x.at} ${x.ok?'✓':'!'} ${x.stage}: ${x.info}`).join('\n');const small=$('ex63-last');if(small)small.textContent=ok?stage:'FEHLER: '+info; if(!ok)small?.classList.add('ex63-warn');else small?.classList.remove('ex63-warn')}
function renderInfo(){const P=S()?.project?.();const m=S()?.audioMetrics?.()||{};const a=$('ex63-audio');if(a){a.textContent=(m.playing?'● PLAY':'● BEREIT')+' · '+(m.sampleRate?Math.round(m.sampleRate/1000)+' kHz':'Audio aus')+' · '+Math.round(m.peak*100)+'% Peak';a.classList.toggle('ex63-warn',m.peak>.98)}const dev=$('ex63-device');if(dev)dev.textContent=(apc?'APC MK2-Profil · ':'MIDI-Learn · ')+lastDevice;const f=$('ex63-fps');if(f)f.textContent=fps+' FPS';const md=$('ex63-mode');if(md)md.textContent=quality.toUpperCase();const sw=$('ex63-led');if(sw)sw.textContent=apc?'APC: AN':'APC: AUS';const panel=$('ex63-dock');panel?.querySelectorAll('[data-panel]').forEach(btn=>btn.setAttribute('aria-pressed',String(btn.dataset.panel===selectedPanel)));
if(diagOpen){const v=$('ex63-data');if(v)v.innerHTML=[['Audio',m.state||'inaktiv'],['Sample-Rate',(m.sampleRate||0)+' Hz'],['Audiopuffer',m.baseLatency===null?'nicht verfügbar':(m.baseLatency*1000).toFixed(1)+' ms'],['Output-Latenz',m.outputLatency===null?'nicht verfügbar':(m.outputLatency*1000).toFixed(1)+' ms'],['Master-Spitze',Math.round((m.peak||0)*100)+'%'],['Limiter',m.limiterReduction===null?'nicht aktiv':m.limiterReduction.toFixed(1)+' dB'],['Bildrate',fps+' FPS (UI)'],['MIDI-Pakete',midiCount+' · echte '+hardwareMessages]].map(([k,val])=>`<span>${escapeText(k)}: <b>${escapeText(val)}</b></span>`).join('')}}
function escapeText(v){return String(v).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]))}
function setPanel(panel){if(!['fx','step','sample','piano'].includes(panel))return;if(!R()?.isOpen?.())R()?.open?.();selectedPanel=panel;const root=$('rack62');if(root)root.dataset.ex63Panel=panel;renderInfo();log('HUD',panel.toUpperCase()+' geöffnet')}
function setTrack(i){const P=S()?.project?.();if(!P?.tracks?.[i])throw Error('Spur nicht vorhanden');R()?.chooseTrack?.(i);return P.tracks[i]}
function clipFor(i){const P=S()?.project?.();const t=P?.tracks?.[i];if(!t)return null;return t.clips.find(c=>c.at<=0 && 0<c.at+c.bars) || t.clips[0] || null}
async function run(target,value=127,origin='TOUCH'){
 const P=S()?.project?.(),api=S();if(!P||!api)throw Error('Studio nicht initialisiert');
 let path=['EINGANG '+origin,'MAPPING '+target];let result='';
 try{
  if(target==='play'){await api.play();result=api.playing()?'Wiedergabe läuft':'Wiedergabe angehalten';}
  else if(target==='stop'){api.stop();result='Wiedergabe gestoppt'}
  else if(target==='master'){api.setMaster(clamp(value/127,0,1));result='Master '+Math.round(P.master*100)+'%';}
  else if(target.startsWith('track')){const t=setTrack(Number(target.slice(5)));result='Spur '+t.name+' gewählt';}
  else if(target.startsWith('mute')){const i=Number(target.slice(4)),t=P.tracks[i];if(!t)throw Error('Spur nicht vorhanden');t.mute=!t.mute;api.updateTrack(i,{mute:t.mute});R()?.render?.();result=t.name+(t.mute?' stumm':' aktiv');}
  else if(target.startsWith('vol')){const i=Number(target.slice(3)),t=P.tracks[i];if(!t)throw Error('Spur nicht vorhanden');const vol=Math.round(clamp(value/127,0,1)*100)/100;api.updateTrack(i,{volume:vol});R()?.render?.();result='Spur '+(i+1)+' Pegel '+Math.round(vol*100)+'%';}
  else if(target.startsWith('step')){const i=R()?.track?.()||0,step=Number(target.slice(4));if(step<0||step>15)throw Error('Ungültiger Step');R()?.editStep?.(i,step);const clip=clipFor(i);if(!clip)throw Error('Kein Sample/Clip: zuerst Sound laden oder Synth-Spur auswählen');result='Spur '+(i+1)+' / Step '+(step+1)+' '+(clip.steps?.[step]?'AN':'AUS');}
  else if(target==='selectedCut'||target==='selectedDrive'){const i=R()?.track?.()||0;const field=target==='selectedCut'?'cut':'drive';const v=field==='cut'?Math.round(180*Math.pow(100,clamp(value/127,0,1))):Math.round(100*clamp(value/127,0,1));api.updateTrack(i,{[field]:v});R()?.render?.();result='Spur '+(i+1)+' '+field+' '+v;}
  else throw Error('Unbekanntes Mapping');
  path.push('PATTERN / INSTRUMENT','SPUR-EQ / FX','MASTER / LIMITER');log('KETTE',path.join(' → ')+' → '+result);renderInfo();return true;
 }catch(err){log('KETTE',path.join(' → ')+' · STOPP: '+err.message,false);renderInfo();return false;}
}
function profileMapping(m){if(!apc||m.channel!==1||!m.device||/^sim[-:]|^test[-:]/i.test(m.device)===false&&!/APC|Akai|mini|mk2/i.test(m.device))return null;
 if(m.type==='note'){
  if(m.number===122){shift=m.value>0;return 'shift';}
  if(m.value===0)return 'ignore';
  if(m.number>=0&&m.number<64){const track=m.number%8,step=Math.floor(m.number/8)+page*8;return {track,step};}
  if(m.number>=100&&m.number<=107)return {target:shift?'mute'+(m.number-100):'track'+(m.number-100)};
  if(m.number===112)return {target:'play'};
  if(m.number===113)return {target:'stop'};
  if(m.number===118||m.number===119)return {page:m.number===119?1:0};
 }
 if(m.type==='cc'&&m.number>=48&&m.number<=56)return {target:m.number===56?'master':'vol'+(m.number-48)};
 return null;}
const recent=new Map();
function receiveMIDI(m){
 midiCount++;const device=String(m.device||'').slice(0,100);
 if(!/^sim[-:]|^test[-:]/i.test(device)){hardwareMessages++;lastDevice=device||'Unbekanntes MIDI-Gerät'}else lastDevice='MIDI-Simulation';
 lastCC=(m.type==='note'?'NOTE':'CC')+' '+m.number+' / '+m.value;renderInfo();
 if(learning){if(m.value===0)return true;const target=learning;learning='';const item={target,type:m.type,number:m.number,channel:m.channel,device:/^sim[-:]|^test[-:]/i.test(device)?'':device};mappings=mappings.filter(x=>x.target!==target&&!(x.type===item.type&&x.number===item.number&&x.channel===item.channel&&(x.device===item.device||!x.device||!item.device)));mappings.push(item);save();updateLearn();log('MIDI LEARN',target+' ← '+item.type+' '+item.number);return true;}
 const matching=mappings.find(x=>x.type===m.type&&x.number===m.number&&x.channel===m.channel&&(!x.device||x.device===device));
 if(matching){if(m.value===0&&m.type==='note')return true;const k='m:'+matching.target;if(m.type==='note'&&performance.now()-(recent.get(k)||0)<100)return true;recent.set(k,performance.now());void run(matching.target,m.value,'MIDI-LEARN');return true;}
 const prof=profileMapping(m);if(prof){if(prof==='shift'||prof==='ignore')return true;if(Number.isInteger(prof.page)){page=prof.page;save();log('APC',`Step-Seite ${page+1}/2`);renderInfo();return true;}if(Number.isInteger(prof.step)){setTrack(prof.track);void run('step'+prof.step,127,'APC GRID');return true;}if(prof.target){void run(prof.target,m.value,'APC MK2');return true;}}
 return false;
}
function suppressStudioNote({device,pitch,channel}){return apc && channel===1 && pitch<=63 && (/APC|Akai|mini|mk2/i.test(device)||/^sim[-:]|^test[-:]/i.test(device))}
function updateLearn(){const e=$('ex63-target');if(!e)return;e.value=learning||e.value||'play';$('ex63-learn').textContent=learning?'HÖRT: '+learning+' …':'MIDI ZUWEISEN';$('ex63-assignments').textContent='Eigene MIDI-Zuweisungen: '+mappings.length;}
function toggleDialog(show){diagOpen=show;const d=$('ex63-overlay');d?.classList.toggle('open',show);if(show)renderInfo()}
function readPeak(){const m=S()?.audioMetrics?.();if(!m?.playing||!m.peak)return;const now=performance.now();if(m.peak>=.985)clipHits++;else clipHits=Math.max(0,clipHits-1);if(clipHits>=3&&now-lastProtect>10000){const old=S().project().master,newValue=Math.max(.15,old*.88);S().setMaster(newValue);lastProtect=now;clipHits=0;log('PEGELSCHUTZ','Master automatisch '+Math.round(old*100)+'% → '+Math.round(newValue*100)+'%, Signalspitze zu hoch',false);}}
function meterLoop(){readPeak();renderInfo()}
function fpsFrame(now){if(document.visibilityState==='hidden'){frames=0;lastFrame=now;raf=requestAnimationFrame(fpsFrame);return}frames++;if(now-lastFrame>1000){fps=Math.max(0,Math.round(frames*1000/(now-lastFrame)));frames=0;lastFrame=now;if(fps<24)lowFPS++;else lowFPS=0;if(lowFPS===4){log('PERFORMANCE',fps+' FPS: ECO-Modus im Diagnosemenü verfügbar',false);lowFPS=0;}}raf=requestAnimationFrame(fpsFrame)}
function setQuality(mode){quality=mode==='eco'?'eco':'normal';save();log('AUDIO',quality==='eco'?'ECO-Modus: reduzierte Diagnose-Abfragerate':'Normalmodus: volle Diagnose');clearInterval(audioTimer);audioTimer=setInterval(meterLoop,quality==='eco'?1500:450);renderInfo()}
function selfTest(){const a=S()?.project?.();if(!a?.tracks?.[0])return log('TEST','Studio nicht bereit',false);let before=a.tracks[0].volume;
 const old=apc;apc=true;const test={device:'sim-apc-mini-mk2',channel:1,type:'cc',number:48,value:64};const outcome=receiveMIDI(test);const after=a.tracks[0].volume;apiSafeRestore(before);apc=old;
 const ok=outcome&&after!==before;log('MIDI-SELBSTTEST',ok?'CC48 → Kanal 1 → Mixer/DSP: OK (simuliert)':'Fehler in der MIDI-Kette',ok);renderInfo();return ok;
 function apiSafeRestore(v){S()?.updateTrack?.(0,{volume:v});R()?.render?.()}}
function initialize(){if(!$('rack62')||!S())return;initSaved();const rack=$('rack62'),surface=rack.querySelector('.r62-surface');if(!surface)return;
 const strip=document.createElement('div');strip.className='ex63-strip';strip.innerHTML='<strong>HEAVY CHAIN 6.3</strong><span id="ex63-audio">Audio bereit</span><span id="ex63-fps">60 FPS</span><button id="ex63-diagnostics-button" type="button">⚙ MIDI / AUDIO TEST</button><button id="ex63-quality-button" type="button">ECO / NORMAL</button><span id="ex63-device">MIDI nicht verbunden</span><span id="ex63-last" class="ex63-ok">Signalweg bereit</span>';
 const title=surface.querySelector('.r62-title');if(title)title.insertAdjacentElement('afterend',strip);else surface.prepend(strip);
 const dock=document.createElement('nav');dock.id='ex63-dock';dock.setAttribute('aria-label','Modul-Navigation');dock.innerHTML=[['fx','FX'],['step','STEP'],['sample','SAMPLE'],['piano','PIANO'],['studio','DAW'],['diagnostics','MIDI']].map(([id,t])=>`<button type="button" data-panel="${id}" aria-pressed="false">${t}</button>`).join('');document.body.append(dock);
 const overlay=document.createElement('div');overlay.id='ex63-overlay';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','MIDI und Audio Diagnostik');overlay.innerHTML='<section class="ex63-dialog"><h2>⚙ HEAVY CHAIN · DIAGNOSE</h2><p>Jeder Trigger läuft überprüfbar durch: MIDI/Touch → Zuordnung → Pattern/Instrument → Kanal-EQ/FX → Master-Limiter → Audioausgabe. Die Log-Anzeige protokolliert Auslöser und Fehler. Keine ungetesteten Hardwarebehauptungen.</p><div class="ex63-chain"><span>EINGANG</span><i>›</i><span>MIDI LEARN</span><i>›</i><span>SEQUENZER</span><i>›</i><span>EQ / FX</span><i>›</i><span>MASTER</span><i>›</i><span>OUTPUT</span></div><div class="ex63-diagnostic" id="ex63-data"></div><div class="ex63-actions"><button id="ex63-apc" type="button">APC MK2-Profil</button><button id="ex63-test" type="button">MIDI-SELBSTTEST</button><button id="ex63-midi-connect" type="button">MIDI VERBINDEN</button><button id="ex63-learn-reset" type="button">Zuweisungen löschen</button></div><div class="ex63-actions"><label for="ex63-target">Ziel: </label><select id="ex63-target"></select><button id="ex63-learn" type="button">MIDI ZUWEISEN</button></div><p><b id="ex63-led">APC: AUS</b> · <span id="ex63-assignments">Keine eigenen Zuweisungen</span> · Letzter Input: <span id="ex63-last-midi">kein</span></p><p>APC-MK2-Sessionprofil: 8×8 Grid → 8 Spuren × 8 Steps; SHIFT + untere Tracktasten → Mute; Scene 1/2 → Play/Stop; Fader CC48–55 → Spurpegel; CC56 → Master; Scene 7/8 → Step-Seite 1/2. Andere Modi bitte separat anlernen.</p><h3>Signal- und Fehlerprotokoll</h3><pre id="ex63-log">Noch keine Auslöser</pre><div class="ex63-actions"><button id="ex63-close" type="button">SCHLIESSEN</button><button id="ex63-resetlog" type="button">Protokoll leeren</button><button id="ex63-exportlog" type="button">Log kopieren</button></div></section>';document.body.append(overlay);
 $('ex63-target').innerHTML=TARGETS.map(x=>`<option value="${x.id}">${escapeText(x.name)}</option>`).join('');
 function navTo(panel){if(panel==='studio'){R()?.close?.();return}if(panel==='diagnostics'){toggleDialog(true);return}setPanel(panel)}
 dock.querySelectorAll('[data-panel]').forEach(x=>x.addEventListener('click',()=>navTo(x.dataset.panel)));
 $('ex63-diagnostics-button').onclick=()=>toggleDialog(true);$('ex63-quality-button').onclick=()=>setQuality(quality==='normal'?'eco':'normal');$('ex63-close').onclick=()=>toggleDialog(false);overlay.addEventListener('click',e=>{if(e.target===overlay)toggleDialog(false)});overlay.addEventListener('keydown',e=>{if(e.key==='Escape')toggleDialog(false)});
 $('ex63-apc').onclick=()=>{apc=!apc;save();log('APC MK2',apc?'Session-Profil aktiv':'Session-Profil aus');renderInfo()};
 $('ex63-test').onclick=selfTest;
 $('ex63-midi-connect').onclick=()=>{R()?.close?.();$('midiConnect')?.click();log('MIDI','Verbindung über System-MIDI-Dialog angefordert');toggleDialog(false)};
 $('ex63-learn').onclick=()=>{learning=$('ex63-target').value;updateLearn();log('MIDI LEARN','Warte auf Note oder CC für '+learning)};
 $('ex63-learn-reset').onclick=()=>{if(confirm('Alle eigenen Heavy-MIDI-Zuweisungen löschen?')){mappings=[];learning='';save();updateLearn();log('MIDI','Heavy-Zuweisungen gelöscht')}};
 $('ex63-resetlog').onclick=()=>{entries.length=0;log('LOG','Protokoll zurückgesetzt')};$('ex63-exportlog').onclick=()=>{const content=entries.map(x=>`${x.at}\t${x.ok?'OK':'WARN'}\t${x.stage}\t${x.info}`).join('\n');if(navigator.clipboard?.writeText)navigator.clipboard.writeText(content).then(()=>log('LOG','Protokoll kopiert')).catch(()=>log('LOG','Kopieren blockiert',false));else log('LOG','Zwischenablage nicht verfügbar',false)};
 if($('r62-midi'))$('r62-midi').title='MIDI-Learn (auch Heavy-Profil im Diagnosetest)';
 setPanel(selectedPanel);setQuality(quality);updateLearn();log('START','64 Pads bleiben beim Start leer. APC-Profil optional, vorhandene MIDI-Mappings behalten.');raf=requestAnimationFrame(fpsFrame);
}
window.EXTRIBE_CHAIN63={run,receiveMIDI,suppressStudioNote,setPanel,openDiagnostics:()=>toggleDialog(true),selfTest,metrics:()=>S()?.audioMetrics?.(),entries:()=>entries.slice(),setAPC:v=>{apc=!!v;save();renderInfo()},getAPC:()=>apc,mappings:()=>mappings.slice(),quality:()=>quality};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize,{once:true});else initialize();
})();
