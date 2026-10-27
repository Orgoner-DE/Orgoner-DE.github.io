/* EX-TRIBE PRO 5.6 | Touch-first studio console, original audio routing and live meters. */
(()=>{'use strict';
const API=window.EXTRIBE_MIDI_API, TEST=window.EXTRIBETest, FX=window.EXTRIBE_FX53, root=document.getElementById('hud55Mount');
if(!API||!TEST||!root)return;
const $=id=>document.getElementById(id), clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)||0));
const cfg={eqLow:[-18,18,1,'LOW','dB'],eqMid:[-18,18,1,'MID','dB'],eqHigh:[-18,18,1,'HIGH','dB'],cut:[500,18000,100,'CUT','Hz'],pan:[-100,100,1,'PAN',''],send:[0,40,1,'SEND','%'],volume:[0,100,1,'LEVEL','%']};
let mainAnalyser=null,drawActive=false,loading=false;
const banks=['A','B','C','D'];
const programs=[
 {id:'bunker',name:'OST-BUNKER',detail:'172 BPM · Dry Kick / Tiefer Rumble / Eisen-Hats',style:'industrial',bpm:172,packs:['osttekk53','iron53','berlinpressure53','osttekk'],drive:29,eq:{low:2,mid:-1,high:1}},
 {id:'schranz',name:'SCHRANZ PRESSURE',detail:'156 BPM · Maschinen-Groove / Metall / Drive',style:'schranz',bpm:156,packs:['iron53','berlinpressure53','iron53','clubrumble53'],drive:34,eq:{low:1,mid:2,high:0}},
 {id:'warehouse',name:'WAREHOUSE CLUB',detail:'148 BPM · Satter Club-Sub / Offbeat / Rave',style:'club',bpm:148,packs:['clubrumble53','osttekk53','berlinpressure53','clubrumble53'],drive:19,eq:{low:3,mid:-2,high:1}},
 {id:'gabba',name:'HARD GABBA',detail:'184 BPM · Crunch-Kick / Distorted Bass / Ride',style:'gabba',bpm:184,packs:['gabba53','iron53','gabba53','osttekk53'],drive:44,eq:{low:1,mid:0,high:-1}}
];
function p(){return API.getProject()}
function getTrack(b,i){return p().banks[b][i]}
function safe(n){return String(n||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]))}
const fLabel=(key,v)=>key==='cut'?(Number(v)/1000).toFixed(1)+'k':key==='pan'?(v==0?'C':v<0?'L'+Math.abs(v):'R'+v):key.startsWith('eq')?(v>0?'+':'')+v+' dB':v+'%';
function biquad(ctx,type,freq,db,Q){const node=ctx.createBiquadFilter();node.type=type;node.frequency.value=freq;if(db!==undefined)node.gain.value=db;if(Q!==undefined)node.Q.value=Q;return node}
function route(ctx,source,destination,t,when=0,duration=0,fxOn=false){
 const low=biquad(ctx,'lowshelf',130,clamp(t.eqLow,-18,18)),mid=biquad(ctx,'peaking',1000,clamp(t.eqMid,-18,18),.9),high=biquad(ctx,'highshelf',6500,clamp(t.eqHigh,-18,18)),filter=biquad(ctx,'lowpass',clamp(t.cut||18000,500,18000),undefined,.71);
 source.connect(low);low.connect(mid);mid.connect(high);high.connect(filter);
 const pan=typeof ctx.createStereoPanner==='function'?ctx.createStereoPanner():null;if(pan){pan.pan.value=clamp(t.pan,-100,100)/100;filter.connect(pan)}
 const out=pan||filter,fx=fxOn&&FX?.connectTrack?.(ctx,out,destination,t.fxMode||'dry',when,duration);
 if(!fx)out.connect(destination);
 const nodes=[low,mid,high,filter,...(pan?[pan]:[])], amount=clamp(t.send,0,40)/100;
 let extra=[];if(amount>.001){const level=ctx.createGain(),delay=ctx.createDelay(1),echo=ctx.createGain(),feedback=ctx.createGain();level.gain.value=amount*.48;delay.delayTime.value=.195;echo.gain.value=.42;feedback.gain.value=.12;out.connect(level);level.connect(delay);delay.connect(echo);echo.connect(destination);delay.connect(feedback);feedback.connect(delay);extra=[level,delay,echo,feedback]}
 return {tail:Math.max(fx?.tail||0,extra.length?1.05:0),release(){try{fx?.release?.()}catch{}for(const n of [...nodes,...extra])try{n.disconnect()}catch{}}};
}
function masterEQ(ctx,input,dry,clip,settings){const low=biquad(ctx,'lowshelf',115,clamp(settings?.low,-12,12)),mid=biquad(ctx,'peaking',1300,clamp(settings?.mid,-12,12),.75),high=biquad(ctx,'highshelf',7000,clamp(settings?.high,-12,12));input.connect(low);low.connect(mid);mid.connect(high);high.connect(dry);high.connect(clip);return {low,mid,high}}
function setMasterEQ(nodes,settings,t=0){if(!nodes)return;for(const key of ['low','mid','high'])nodes[key].gain.setTargetAtTime(clamp(settings?.[key],-12,12),t,.018)}
function meter(ctx,input){mainAnalyser=ctx.createAnalyser();mainAnalyser.fftSize=2048;mainAnalyser.smoothingTimeConstant=.76;input.connect(mainAnalyser);return mainAnalyser}
function status(text,error=false){const s=$('hud55Status');if(s){s.textContent=text;s.classList.toggle('error',!!error)}}
function rowInput(key,val,b,i){const [min,max,step,label]=cfg[key];const desc=`Bank ${banks[b]} Pad ${i+1} ${label}`;return `<label class="hud55-knob"><span>${label} <output data-out="${key}">${fLabel(key,val)}</output></span><input aria-label="${desc}" type="range" data-b="${b}" data-i="${i}" data-key="${key}" min="${min}" max="${max}" step="${step}" value="${Number(val)}"></label>`}
function render(){
 const b=API.getBank();const P=p(),tracks=P.banks[b];
 root.innerHTML=`<section class="hud55-hero"><div><span class="hud55-eyebrow">EX-TRIBE / PRO 5.6 / LIVE MIX CONSOLE</span><h2>STUDIO <span>EQ</span> <small>16 CH</small></h2><p>Direktes Audio-Routing · 3-Band-EQ · Stereo-Pan · Filter · Delay-Send · Master-Analyzer</p></div><div class="hud55-brand-chip">${safe(P.name)}<span> BANK ${banks[b]} </span></div></section>
 <section class="hud55-presets"><div class="hud55-section-head"><div><span class="hud55-eyebrow">READY-TO-PLAY / ORIGINALS</span><h3>OST-TEKK PERFORMANCE PRESETS</h3><p>Ein Klick belegt alle vier Bänke, programmiert Beats und aktiviert passende Effekte. Dein leerer Start bleibt unverändert.</p></div><span id="hud55Status" role="status" aria-live="polite">Preset wählen oder selbst mischen</span></div><div class="hud55-preset-grid">${programs.map(x=>`<button class="hud55-preset" data-load="${x.id}" ${loading?'disabled':''}><strong>${x.name}</strong><span>${x.detail}</span><em>＋ SET LADEN</em></button>`).join('')}</div></section>
 <section class="hud55-master"><div class="hud55-section-head"><div><span class="hud55-eyebrow">MASTER / FINAL BUS</span><h3>MASTER EQ + SPECTRUM</h3></div><button class="hud55-flat" id="hud55ResetEQ">EQ NEUTRAL</button></div><div class="hud55-master-body"><div class="hud55-master-eq">${['low','mid','high'].map(key=>`<label class="hud55-master-knob"><span>${key.toUpperCase()} <output data-master-out="${key}">${fLabel('eqLow',P.masterEq?.[key]||0)}</output></span><input aria-label="Master ${key} EQ" data-master="${key}" type="range" min="-12" max="12" step="1" value="${P.masterEq?.[key]||0}"></label>`).join('')}</div><div class="hud55-spectrum-wrap"><canvas id="hud55Spectrum" width="520" height="120" aria-label="Echtzeit-Frequenzanalyse und Master-Pegel"></canvas><div class="hud55-meterline"><span>MASTER OUT · POST EQ</span><output id="hud55Db">— dBFS</output></div></div></div></section>
 <div class="hud55-section-head hud55-ch-head"><div><span class="hud55-eyebrow">CHANNEL STRIPS · BANK ${banks[b]}</span><h3>16 SPUREN · DIREKTE KLANGKONTROLLE</h3></div><span>Alle Einstellungen gelten auch für den WAV-Export</span></div>
 <section class="hud55-channels">${tracks.map((t,i)=>`<article class="hud55-strip" data-strip="${i}"><div class="hud55-strip-head"><span class="hud55-channel">CH ${String(i+1).padStart(2,'0')}</span><strong title="${safe(t.sampleName)}">${safe((t.sampleName||'LEERES PAD').slice(0,35))}</strong><button class="hud55-reset" data-reset="${i}" aria-label="Pad ${i+1} EQ zurücksetzen">FLAT</button><button class="hud55-mute ${t.mute?'muted':''}" data-mute="${i}" aria-label="Pad ${i+1} stummschalten">${t.mute?'MUTED':'MUTE'}</button></div><div class="hud55-knobs">${['eqLow','eqMid','eqHigh','cut','pan','send'].map(key=>rowInput(key,t[key]??cfg[key][1],b,i)).join('')}</div><div class="hud55-bottom"><label class="hud55-fx-label">FX CHAIN<select data-fx="${i}" aria-label="Pad ${i+1} FX-Kette">${(FX?.MODES||[['dry','DRY']]).map(([id,name])=>`<option value="${id}" ${t.fxMode===id?'selected':''}>${name}</option>`).join('')}</select></label><div class="hud55-level">${rowInput('volume',t.volume,b,i)}<div class="hud55-activity" data-activity="${i}"><span></span></div></div></div></article>`).join('')}</section>
 <p class="hud55-footnote">Sicherer Start: keine Samples, Steps oder FX vorgeladen. Extreme EQ-Anhebungen können Übersteuerung verursachen. Master-Clipper und Kompressor bleiben als Pegelschutz vorhanden.</p>`;
 root.querySelectorAll('input[data-key]').forEach(el=>el.addEventListener('input',()=>{const b=Number(el.dataset.b),i=Number(el.dataset.i),key=el.dataset.key,t=getTrack(b,i),value=Number(el.value);t[key]=value;el.closest('label').querySelector('output').textContent=fLabel(key,value);API.setDirty();}));
 root.querySelectorAll('select[data-fx]').forEach(el=>el.addEventListener('change',()=>{const t=getTrack(API.getBank(),Number(el.dataset.fx));t.fxMode=el.value;if(el.value!=='dry'){p().fx=true;API.updateControls()}API.setDirty()}));
 root.querySelectorAll('[data-reset]').forEach(el=>el.onclick=()=>{const t=getTrack(API.getBank(),Number(el.dataset.reset));Object.assign(t,{eqLow:0,eqMid:0,eqHigh:0,cut:18000,pan:0,send:0});API.setDirty();render()});
 root.querySelectorAll('[data-mute]').forEach(el=>el.onclick=()=>{const t=getTrack(API.getBank(),Number(el.dataset.mute));t.mute=!t.mute;el.classList.toggle('muted',t.mute);el.textContent=t.mute?'MUTED':'MUTE';API.setDirty()});
 root.querySelectorAll('input[data-master]').forEach(el=>el.addEventListener('input',()=>{const key=el.dataset.master;if(!p().masterEq)p().masterEq={low:0,mid:0,high:0};p().masterEq[key]=Number(el.value);el.closest('label').querySelector('output').textContent=fLabel('eqLow',el.value);API.updateFx();API.setDirty()}));
 $('hud55ResetEQ').onclick=()=>{p().masterEq={low:0,mid:0,high:0};API.updateFx();API.setDirty();render()};
 root.querySelectorAll('[data-load]').forEach(el=>el.onclick=()=>loadPreset(el.dataset.load));
 if(!drawActive){drawActive=true;requestAnimationFrame(animate)}
}
async function loadPreset(id){const def=programs.find(x=>x.id===id);if(!def||loading)return;if(p().banks.flat().some(t=>t.sampleData||t.steps.some(Boolean))&&!window.confirm('Das Preset ersetzt deine aktuell geladenen Pads, Steps und Songteile. Vorher über MENÜ sichern?'))return;
 loading=true;status('Lade '+def.name+' · Samples werden synthetisiert…');root.querySelectorAll('[data-load]').forEach(b=>b.disabled=true);
 try{TEST.reset();const P=p();P.name='EX-TRIBE · '+def.name;P.bpm=def.bpm;P.length=16;P.master=72;P.swing=def.style==='club'?5:2;P.fx=true;P.fxPreset=def.style;P.masterDrive=def.drive;P.masterEq={...def.eq};Object.assign(P,FX.defaults[def.style]||{});
  for(let b=0;b<4;b++){
   await TEST.installPack(def.packs[b],b);
   if(P.banks[b].some(t=>!t.sampleData))throw Error('Ein Sample-Pack konnte nicht vollständig geladen werden');
   for(let i=0;i<16;i++){const t=P.banks[b][i];t.mute=false;t.volume=i<4?74:i<8?48:i<12?44:32;t.eqLow=i<8?2:-2;t.eqMid=(def.style==='schranz'&&i>8)?3:-1;t.eqHigh=i>9?2:0;t.cut=i<8?12500:16500;t.pan=i<8?0:(i%2===0?-24:24);t.send=i>9?Math.min(24,8+b*4):i>3?4:0;t.fxMode=FX.presetMap(def.style,i);t.steps.fill(false);
     let indices=[];if(i===0)indices=b===0?[0,4,8,12]:[0,4,8,12];else if(i===1)indices=b===2?[6,14]:b===3?[3,7,11,15]:[8];else if(i===4)indices=b===0?[4,12]:[2,6,10,14];else if(i===8||i===9)indices=[4,12];else if(i===10)indices=b===0?[2,6,10,14]:[0,2,4,6,8,10,12,14];else if(i===11)indices=[7,15];else if(i===12&&b>0)indices=[3,7,11,15];else if(i===14)indices=b===2?[8]:[0,8];else if(i===15&&b===3)indices=[15];indices.forEach(step=>t.steps[step]=true)
   }
  }
  const names=['INTRO','BUILD','DROP','OUTRO'];P.songPatterns=names.map((name,b)=>({id:`p55_${def.id}_${b}`,name:`${name} · ${banks[b]}`,bank:b,length:16,steps:P.banks[b].map(t=>t.steps.slice())}));P.arrangement=P.songPatterns.map((pt,b)=>({patternId:pt.id,repeats:b===2?4:2}));
  API.setBank(0);API.updateControls();API.setDirty();API.setView('mixer');render();status(def.name+' geladen · 4 Bänke · 64 Samples · 4 Song-Patterns');
 }catch(e){status('Preset-Fehler: '+e.message,true)}finally{loading=false;root.querySelectorAll('[data-load]').forEach(b=>b.disabled=false)}
}
function animate(){if(document.hidden){setTimeout(()=>requestAnimationFrame(animate),500);return}const canvas=$('hud55Spectrum');if(canvas&&canvas.isConnected){const g=canvas.getContext('2d');if(g){const w=canvas.width,h=canvas.height;g.clearRect(0,0,w,h);g.fillStyle='#0a1722';g.fillRect(0,0,w,h);g.strokeStyle='#244353';g.lineWidth=1;for(let j=1;j<5;j++){g.beginPath();g.moveTo(0,j*h/5);g.lineTo(w,j*h/5);g.stroke()}
  let rms=0,peak=0;if(mainAnalyser){const bytes=new Uint8Array(mainAnalyser.frequencyBinCount),samples=new Float32Array(mainAnalyser.fftSize);mainAnalyser.getByteFrequencyData(bytes);mainAnalyser.getFloatTimeDomainData(samples);for(const v of samples){rms+=v*v;peak=Math.max(peak,Math.abs(v))}rms=Math.sqrt(rms/samples.length);for(let i=0;i<56;i++){const k=Math.max(0,Math.min(bytes.length-1,Math.round((Math.pow((i+.5)/56,2.3))*(bytes.length-1))));const v=bytes[k]/255,bar=Math.max(2,v*(h-12));g.fillStyle=v>.77?'#ff7580':v>.51?'#e8c766':'#80dce6';g.fillRect(i*w/56+1,h-bar,Math.max(2,w/56-3),bar)}}
   const output=$('hud55Db');if(output)output.textContent=mainAnalyser?(20*Math.log10(Math.max(.0001,rms))).toFixed(1)+' dBFS':'— dBFS';
  }}requestAnimationFrame(animate)}
window.EXTRIBE_HUD55={route,masterEQ,setMasterEQ,meter,render,loadPreset,programs,debug:()=>({tracks:p().banks[API.getBank()].length,masterEq:p().masterEq,analyser:!!mainAnalyser,version:'5.6'})};
render();
})();
