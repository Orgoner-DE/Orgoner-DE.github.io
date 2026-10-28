/* EX-TRIBE STUDIO 6.1 | Piano + Synth: original Web Audio voices, no external samples. */
(()=>{'use strict';
const S=()=>window.EXTRIBE_STUDIO60;
const $=id=>document.getElementById(id);
const noteNames=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
const noteName=n=>noteNames[n%12]+(Math.floor(n/12)-1);
const PRESETS={
 'ELECTRIC KEYS':{wave:'sine',second:'sine',sub:0,harmonic:2,mix:.32,attack:.012,decay:.32,sustain:.25,release:.35,cut:6100,resonance:.7,detune:2,volume:.6},
 'WAREHOUSE SAW':{wave:'sawtooth',second:'sawtooth',sub:.15,harmonic:1,mix:.4,attack:.005,decay:.18,sustain:.68,release:.2,cut:4000,resonance:1.3,detune:12,volume:.38},
 'ACID 303':{wave:'square',second:'sawtooth',sub:0,harmonic:1,mix:.3,attack:.003,decay:.12,sustain:.21,release:.08,cut:2100,resonance:8,detune:0,volume:.43},
 '808 SUB BASS':{wave:'sine',second:'triangle',sub:.2,harmonic:1,mix:.2,attack:.006,decay:.27,sustain:.6,release:.22,cut:650,resonance:.8,detune:0,volume:.65},
 'RAVE STAB':{wave:'sawtooth',second:'square',sub:.15,harmonic:1,mix:.47,attack:.005,decay:.18,sustain:.13,release:.16,cut:3500,resonance:2,detune:15,volume:.34},
 'GLASS BELL':{wave:'sine',second:'sine',sub:0,harmonic:3,mix:.45,attack:.003,decay:.63,sustain:.04,release:.7,cut:8400,resonance:.5,detune:1,volume:.52},
 'WARM PAD':{wave:'triangle',second:'sawtooth',sub:.2,harmonic:1,mix:.38,attack:.35,decay:.5,sustain:.65,release:1.1,cut:2300,resonance:.9,detune:7,volume:.38},
 'GABBA LEAD':{wave:'square',second:'sawtooth',sub:.38,harmonic:1,mix:.37,attack:.002,decay:.12,sustain:.55,release:.13,cut:2700,resonance:3.6,detune:6,volume:.32}
};
const LIMITS={attack:[.002,1.2],decay:[.02,2],sustain:[0,1],release:[.03,2.5],cut:[150,15000],resonance:[.5,12],detune:[0,30],volume:[0,.85],mix:[0,.7],sub:[0,.5]};
const DEFAULT='ELECTRIC KEYS';
let root=null,octave=3,recording=false,stepCursor=0,liveAudio=null,liveBus=null,active=new Map(),keyboardMap=new Map(),pressed=new Set(),lastSelected=null;
const bound=(n,lo,hi,def)=>{n=Number(n);return Number.isFinite(n)?Math.max(lo,Math.min(hi,n)):def};
function config(t){if(!t)return structuredClone(PRESETS[DEFAULT]);const p=PRESETS[t.synthPreset61]||PRESETS[DEFAULT];if(!t.synth61)t.synth61={...p};const out={...p,...t.synth61};for(const [k,[lo,hi]] of Object.entries(LIMITS))out[k]=bound(out[k],lo,hi,p[k]);out.wave=['sine','square','sawtooth','triangle'].includes(out.wave)?out.wave:p.wave;out.second=['sine','square','sawtooth','triangle'].includes(out.second)?out.second:p.second;out.harmonic=bound(out.harmonic,1,6,1);return out}
function ensureTrack(){const api=S();if(!api)return null;let t=api.getSelectedTrack?.();if(!t||t.type!=='synth')t=api.addTrack('PIANO SYNTH','synth','sine');if(!t.synth61){t.synthPreset61=DEFAULT;t.synth61={...PRESETS[DEFAULT]}}return t}
function graphVoice(ac,out,when,pitch,opt,velocity=1,duration=null){
 const freq=440*Math.pow(2,(pitch-69)/12),v=bound(velocity,0,1,1),q=bound(opt.resonance,.5,12,1);
 const filter=ac.createBiquadFilter(),env=ac.createGain(),mixed=ac.createGain();filter.type='lowpass';filter.frequency.setValueAtTime(bound(opt.cut,150,15000,5000),when);filter.Q.value=q;
 mixed.connect(filter);filter.connect(env);env.connect(out);
 const a=bound(opt.attack,.002,1.2,.01),d=bound(opt.decay,.02,2,.2),s=bound(opt.sustain,0,1,.5),r=bound(opt.release,.03,2.5,.2),level=bound(opt.volume,0,.85,.5)*Math.max(.08,v);
 env.gain.setValueAtTime(.00001,when);env.gain.linearRampToValueAtTime(level,when+a);env.gain.exponentialRampToValueAtTime(Math.max(.00001,level*Math.max(s,.0001)),when+a+d);
 const oscs=[];
 const addOsc=(type,harmonic,detune,gain)=>{if(gain<=0)return;const o=ac.createOscillator(),g=ac.createGain();o.type=type;o.frequency.setValueAtTime(freq*harmonic,when);o.detune.setValueAtTime(detune,when);g.gain.value=gain;o.connect(g);g.connect(mixed);o.start(when);oscs.push(o)};
 const mix=bound(opt.mix,0,.7,.3),sub=bound(opt.sub,0,.5,0);
 addOsc(opt.wave||'sine',1,-bound(opt.detune,0,30,0)*.5,Math.max(0,1-mix)*.5);
 addOsc(opt.second||'sine',bound(opt.harmonic,1,6,1),bound(opt.detune,0,30,0)*.5,mix*.5);
 if(sub)addOsc('sine',.5,0,sub*.32);
 let stopped=false;
 const release=at=>{if(stopped)return;stopped=true;const now=Math.max(at,when+a+.002);env.gain.cancelScheduledValues(now);env.gain.setValueAtTime(Math.max(.00001,level*s*.7),now);env.gain.exponentialRampToValueAtTime(.00001,now+r);for(const o of oscs)try{o.stop(now+r+.035)}catch{};return now+r+.035};
 if(duration!==null)release(when+Math.max(.035,duration));
 return {release,env,oscs};
}
function scheduleSynth(ac,out,when,pitch,track,velocity=1,duration=.2){graphVoice(ac,out,when,pitch,config(track),velocity,duration);return true}
async function audio(){if(!liveAudio){liveAudio=new (window.AudioContext||window.webkitAudioContext)({latencyHint:'interactive'});liveBus=liveAudio.createGain();const limiter=liveAudio.createDynamicsCompressor();limiter.threshold.value=-10;limiter.ratio.value=8;liveBus.gain.value=.8;liveBus.connect(limiter);limiter.connect(liveAudio.destination)}if(liveAudio.state!=='running')await liveAudio.resume();return liveAudio}
async function noteOn(pitch,velocity=1,source='pointer'){if(active.has(source+':'+pitch))return;const t=ensureTrack();if(!t)return;try{const a=await audio(),now=a.currentTime+.003;const voice=graphVoice(a,liveBus,now,pitch,config(t),velocity);active.set(source+':'+pitch,voice);pressed.add(pitch);paintKeys();if(recording)capture(pitch,velocity);$('p61status').textContent=noteName(pitch)+' · '+Math.round(velocity*127)+' VELOCITY'}catch(e){if($('p61status'))$('p61status').textContent='Audio: '+e.message}}
function noteOff(pitch,source='pointer'){const key=source+':'+pitch,v=active.get(key);if(v){v.release(liveAudio?.currentTime||0);active.delete(key)}pressed.delete(pitch);paintKeys()}
function stopNotes(){for(const [k,v] of active){v.release(liveAudio?.currentTime||0)}active.clear();pressed.clear();paintKeys()}
function capture(pitch,velocity){const api=S();let c=api?.getSelectedClip?.();if(!c||c.kind!=='synth'){c=api?.createPianoClip?.();if(!c)return}c.steps=Array(16).fill(false);c.notes=Array.isArray(c.notes)?c.notes:[];const step=api?.playing?.()?Math.floor(api.transportTick()/1)%16:stepCursor++%16;
 const i=c.notes.findIndex(n=>n.pitch===pitch&&n.step===step);if(i>=0)c.notes.splice(i,1);c.notes.push({pitch,step,velocity:bound(velocity,0,1,1),duration:1});api.render();$('p61status').textContent='REC '+noteName(pitch)+' → STEP '+String(step+1).padStart(2,'0')}
function selectPreset(name){const t=ensureTrack();if(!t||!PRESETS[name])return;t.synthPreset61=name;t.synth61={...PRESETS[name]};t.wave=t.synth61.wave;if($('p61preset'))$('p61preset').value=name;renderParams();S()?.renderDevices?.()}
function paramsHTML(){return Object.entries(LIMITS).map(([key,[min,max]])=>`<label><span>${({attack:'ATTACK',decay:'DECAY',sustain:'SUSTAIN',release:'RELEASE',cut:'FILTER',resonance:'RESONANZ',detune:'DETUNE',volume:'LEVEL',mix:'OSC 2 MIX',sub:'SUB OSC'})[key]}</span><input data-param="${key}" type="range" min="${min}" max="${max}" step="${key==='cut'?50:.01}"><output data-output="${key}"></output></label>`).join('')}
function create(){if(root)return;const studio=$('studio60');if(!studio)return;root=document.createElement('section');root.id='piano61';root.className='p61-closed';root.setAttribute('aria-label','Piano Synthesizer');root.innerHTML=`
 <header class="p61-header"><div><strong>◈ PIANO SYNTH 6.1</strong><small>POLYPHON · WEB AUDIO · MIDI</small></div><select id="p61preset" aria-label="Synth-Preset">${Object.keys(PRESETS).map(x=>`<option>${x}</option>`).join('')}</select><button id="p61record" class="p61-record">● REC OFF</button><button id="p61close" aria-label="Piano schließen">✕</button></header>
 <div class="p61-toolbar"><div class="p61-oct"><button id="p61octdown">−</button><span id="p61octlabel">C3–C5</span><button id="p61octup">＋</button></div><span class="p61-hint">Tasten spielen · REC schreibt ins Piano-Roll · MIDI-IN über MIDI VERBINDEN</span><button id="p61clip">＋ PIANO-CLIP</button><span id="p61status">Bereit</span></div>
 <div class="p61-content"><div class="p61-keyscroll"><div id="p61keys" class="p61-keys" role="group" aria-label="Piano-Tastatur"></div></div><div class="p61-controls" id="p61controls">${paramsHTML()}</div></div>
 <div class="p61-footer"><span>⌨ TASTATUR: A W S E D F T G Y H U J K (C–C)</span><span>Ton direkt per AudioContext · kein Internet nötig</span></div>`;
 studio.append(root);
 $('p61close').onclick=close;
 $('p61preset').onchange=e=>selectPreset(e.target.value);
 $('p61record').onclick=()=>{recording=!recording;const btn=$('p61record');btn.classList.toggle('p61-armed',recording);btn.textContent=recording?'● REC ON':'● REC OFF';if(recording)ensureTrack()};
 $('p61clip').onclick=()=>{S()?.createPianoClip?.();$('p61status').textContent='Piano-Clip erstellt · REC aktiviert die Aufzeichnung'};
 $('p61octdown').onclick=()=>{octave=Math.max(1,octave-1);keys()};$('p61octup').onclick=()=>{octave=Math.min(6,octave+1);keys()};
 root.querySelectorAll('[data-param]').forEach(el=>{el.oninput=()=>{const t=ensureTrack();if(!t)return;t.synth61[el.dataset.param]=+el.value;root.querySelector(`[data-output="${el.dataset.param}"]`).textContent=Number(el.value).toFixed(el.dataset.param==='cut'?0:2)}});
 document.addEventListener('keydown',keyDown);document.addEventListener('keyup',keyUp);window.addEventListener('blur',stopNotes);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stopNotes()});
 window.addEventListener('extribe-studio-midi',e=>{if(root.classList.contains('p61-closed'))return;const m=e.detail;if(m?.type!=='note')return;if(m.velocity>0)noteOn(m.pitch,m.velocity/127,'midi');else noteOff(m.pitch,'midi')});
 keys();renderParams();
}
function keys(){if(!$('p61keys'))return;stopNotes();const area=$('p61keys');area.innerHTML='';const start=12*(octave+1),white=[0,2,4,5,7,9,11],whiteCount=14;
 for(let i=0;i<whiteCount;i++){const oct=Math.floor(i/7),offset=white[i%7],note=start+oct*12+offset;const btn=document.createElement('button');btn.className='p61-white';btn.dataset.pitch=note;btn.innerHTML=`<span>${noteName(note)}</span>`;btn.setAttribute('aria-label','Note '+noteName(note));wireKey(btn,note);area.append(btn)}
 for(let i=0;i<24;i++){const pitch=start+i,mod=pitch%12;if(![1,3,6,8,10].includes(mod))continue;const left=whiteCountBefore(i)-.38;const btn=document.createElement('button');btn.className='p61-black';btn.dataset.pitch=pitch;btn.style.left=`calc(${left} * var(--p61-white-width))`;btn.setAttribute('aria-label','Note '+noteName(pitch));wireKey(btn,pitch);area.append(btn)}
 $('p61octlabel').textContent='C'+octave+'–C'+(octave+2)}
function whiteCountBefore(index){const n=[0,2,4,5,7,9,11];let count=0;for(let i=0;i<index;i++)if(n.includes(i%12))count++;return count}
function wireKey(el,pitch){el.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();try{el.setPointerCapture(e.pointerId)}catch{}noteOn(pitch,1,'touch'+e.pointerId)});el.addEventListener('pointerup',e=>{noteOff(pitch,'touch'+e.pointerId)});el.addEventListener('pointercancel',e=>noteOff(pitch,'touch'+e.pointerId));el.addEventListener('lostpointercapture',e=>noteOff(pitch,'touch'+e.pointerId))}
function paintKeys(){if(!root)return;root.querySelectorAll('[data-pitch]').forEach(el=>el.classList.toggle('p61-active',pressed.has(+el.dataset.pitch)))}
function renderParams(){if(!root)return;const t=S()?.getSelectedTrack?.(),p=config(t);root.querySelectorAll('[data-param]').forEach(i=>{const k=i.dataset.param;i.value=p[k];root.querySelector(`[data-output="${k}"]`).textContent=Number(p[k]).toFixed(k==='cut'?0:2)});$('p61preset').value=t?.synthPreset61 in PRESETS?t.synthPreset61:DEFAULT}
function open(){create();ensureTrack();root.classList.remove('p61-closed');renderParams();keys();return true}
function close(){stopNotes();if(root)root.classList.add('p61-closed');recording=false;if($('p61record')){$('p61record').textContent='● REC OFF';$('p61record').classList.remove('p61-armed')}}
function isOpen(){return !!root&&!root.classList.contains('p61-closed')}
function keyDown(e){if(!isOpen()||e.repeat||['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName)||e.ctrlKey||e.metaKey||e.altKey)return;const map='awsedftgyhujk';const i=map.indexOf(e.key.toLowerCase());if(i<0)return;e.preventDefault();const n=12*(octave+1)+i;keyboardMap.set(e.code,n);noteOn(n,.85,'keyboard')}
function keyUp(e){const n=keyboardMap.get(e.code);if(n===undefined)return;keyboardMap.delete(e.code);noteOff(n,'keyboard')}
window.EXTRIBE_PIANO61={open,close,config,PRESETS,scheduleSynth,noteOn,noteOff,isOpen,stopNotes,selectPreset,renderParams,record:()=>recording};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',create,{once:true});else create();
})();
