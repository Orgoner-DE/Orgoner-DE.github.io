/* EX-TRIBE STUDIO 6.2 | Hardware performance rack (original interface).
   Uses EXTRIBE_STUDIO60's actual transport, tracks, sample clips and DSP.
   No real hardware or trademark affiliation is implied. */
(()=>{'use strict';
const S=()=>window.EXTRIBE_STUDIO60;
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const clamp=(v,min,max)=>Math.max(min,Math.min(max,Number(v)||0));
let rack=null,selected=0,bar=0,mode='filter',depth=.75,held=false,record=false,recordStep=0,octave=3;
let pack=null,index=0,gridTimers=null,drag=null,lastStatus='Wähle ein Preset oder lade Samples.';
const current=()=>S()?.project?.();
const tracks=()=>current()?.tracks||[];
const isActive=()=>rack&&!rack.classList.contains('r62-hidden');
const modes={filter:'FILTER',drive:'DRIVE',delay:'DELAY',reverb:'REVERB'};
const presets=['ELECTRIC KEYS','WAREHOUSE SAW','ACID 303','808 SUB BASS','RAVE STAB','GLASS BELL','WARM PAD','GABBA LEAD'];
function status(message){lastStatus=message;if($('r62-status'))$('r62-status').textContent=message}
function setTrack(i){selected=clamp(i,0,tracks().length-1);S()?.selectTrack?.(selected);updateTrackDetails();renderGrid();renderMixer();}
function selectBar(b){bar=clamp(b,0,Math.max(0,(current()?.bars||32)-1));$('r62-bar').textContent=String(bar+1).padStart(2,'0');renderGrid();renderArranger()}
function clipFor(i){return tracks()[i]?.clips?.find(c=>bar>=c.at&&bar<c.at+c.bars)||null}
function samplePacks(){return window.EXTRIBE_PACKS||[]}
function selectedSample(){const p=samplePacks().find(x=>x.id===pack);return p?.samples?.[index]?{id:p.id,index,name:p.samples[index].name}:null}
function renderSamples(){const packs=samplePacks();const pp=$('r62-packs');if(!pp)return;
 if(!packs.some(x=>x.id===pack))pack=packs[0]?.id||null;
 pp.innerHTML=packs.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');pp.value=pack||'';
 const p=packs.find(x=>x.id===pack),ss=$('r62-samples');ss.innerHTML=(p?.samples||[]).map((s,i)=>`<option value="${i}">${String(i+1).padStart(2,'0')} · ${esc(s.name)}</option>`).join('');index=clamp(index,0,(p?.samples.length||1)-1);ss.value=index;
 $('r62-sample-name').textContent=selectedSample()?.name||'KEIN SAMPLE';}
function createClip(i,kind=null){const api=S(),t=tracks()[i];if(!t)return null;let c=clipFor(i);if(c)return c;
 const src=selectedSample();let k=kind||((t.type==='synth')?'synth':'sample');
 if(k==='sample'&&!src){status('Bitte zuerst ein Sample wählen');return null}
 if(k==='sample')t.type='drum';
 const ob=k==='sample'?{id:src.id,index:src.index,name:src.name}:{name:'RACK SYNTH'};
 c=api.addClipAt(i,bar,k,ob);if(!c){status('Hier ist kein Platz für einen neuen Clip');return null}
 if(k==='sample'){c.sampleIndex=src.index;c.sourceId=src.id}c.steps=Array(16).fill(false);c.notes=[];return c}
function editStep(i,step){const t=tracks()[i];if(!t)return;let c=clipFor(i)||createClip(i);if(!c)return;
 if(c.kind==='synth'&&c.notes?.length){c.notes=c.notes.filter(n=>n.step!==step);c.steps[step]=true;}else c.steps[step]=!c.steps[step];
 S()?.refresh?.();renderGrid();status(`${esc(t.name)} · Step ${step+1} ${c.steps[step]?'AN':'AUS'}`)}
function renderGrid(){const box=$('r62-grid');if(!box)return;const p=current(),tt=tracks();if(!p)return;
 const body=[];
 for(let i=0;i<8;i++){
 const t=tt[i];if(!t)continue;const c=clipFor(i),arr=c?.steps||[];const on=!!c&&!t.mute;
 body.push(`<div class="r62-row ${i===selected?'selected':''}" data-row="${i}"><button class="r62-rowname" data-select="${i}" title="Spur auswählen">${esc(t.name)}</button><button class="r62-mini ${t.mute?'muted':''}" data-mute="${i}" title="Mute">${t.mute?'M':'●'}</button><div class="r62-steps">${Array.from({length:16},(_,j)=>`<button class="r62-step ${arr[j]?'is-on':''} ${on&&S().playing()&&S().transportTick()%16===j?'is-playhead':''}" data-step="${i}:${j}" aria-label="${esc(t.name)} Schritt ${j+1}" aria-pressed="${!!arr[j]}"><span>${j+1}</span></button>`).join('')}</div></div>`)}
 box.innerHTML=body.join('');
 box.querySelectorAll('[data-step]').forEach(btn=>btn.addEventListener('click',()=>{const [r,c]=btn.dataset.step.split(':').map(Number);editStep(r,c)}));
 box.querySelectorAll('[data-select]').forEach(btn=>btn.onclick=()=>setTrack(+btn.dataset.select));
 box.querySelectorAll('[data-mute]').forEach(btn=>btn.onclick=()=>toggleMute(+btn.dataset.mute));
 $('r62-clip').textContent=clipFor(selected)?.name||'LEER · SAMPLE LADEN';}
function toggleMute(i){const t=tracks()[i];if(!t)return;t.mute=!t.mute;S()?.updateTrack?.(i,{});renderGrid();renderMixer();status(t.name+(t.mute?' stumm':' aktiv'))}
function toggleSolo(i){const t=tracks()[i];if(!t)return;t.solo=!t.solo;S()?.updateTrack?.(i,{});renderMixer();status(t.name+(t.solo?' SOLO':' SOLO AUS'))}
function renderMixer(){const e=$('r62-mixer');if(!e)return;e.innerHTML=tracks().slice(0,8).map((t,i)=>`<div class="r62-channel ${i===selected?'selected':''}"><button class="r62-channelname" data-mixsel="${i}">${esc(t.name).slice(0,8)}</button><div class="r62-meter"><i style="height:${Math.round(S()?.meters?.()?.[i]||0)}%"></i></div><input type="range" class="r62-fader" orient="vertical" min="0" max="1.25" step="0.01" value="${t.volume}" data-vol="${i}" aria-label="${esc(t.name)} Lautstärke"><div class="r62-channelcontrols"><button data-mixmute="${i}" class="${t.mute?'is-red':''}" title="Mute">M</button><button data-solo="${i}" class="${t.solo?'is-gold':''}" title="Solo">S</button></div></div>`).join('');
 e.querySelectorAll('[data-mixsel]').forEach(x=>x.onclick=()=>setTrack(+x.dataset.mixsel));
 e.querySelectorAll('[data-vol]').forEach(x=>x.oninput=()=>{S()?.updateTrack?.(+x.dataset.vol,{volume:+x.value});$('r62-track-volume').value=x.value});
 e.querySelectorAll('[data-mixmute]').forEach(x=>x.onclick=()=>toggleMute(+x.dataset.mixmute));
 e.querySelectorAll('[data-solo]').forEach(x=>x.onclick=()=>toggleSolo(+x.dataset.solo));}
function renderArranger(){const el=$('r62-song');if(!el)return;const P=current();if(!P)return;const cols=16;
 el.innerHTML=`<div class="r62-song-ruler">${Array.from({length:cols},(_,i)=>`<button data-jump="${i*2}">${i*2+1}</button>`).join('')}</div>`+tracks().slice(0,7).map((t,i)=>`<div class="r62-song-lane"><span>${esc(t.name).slice(0,8)}</span><div class="r62-song-clips">${Array.from({length:cols},(_,j)=>{const c=t.clips.find(c=>c.at<=j*2&&c.at+c.bars>j*2);return `<button title="Takt ${j*2+1}: ${c?.name||'leer'}" class="${c?'filled':''} ${Math.floor(bar/2)===j?'chosen':''}" style="--lane:${t.color||'#e5a66d'}" data-songbar="${j*2}"></button>`}).join('')}</div></div>`).join('');
 el.querySelectorAll('[data-songbar],[data-jump]').forEach(x=>x.onclick=()=>selectBar(+(x.dataset.songbar??x.dataset.jump)))}
function updateTrackDetails(){const t=tracks()[selected];if(!t)return;$('r62-selected').textContent=t.name;$('r62-track-volume').value=t.volume;
 $('r62-track-cut').value=t.cut;$('r62-track-drive').value=t.drive;$('r62-track-delay').value=t.delay;
 $('r62-track-reverb').value=t.reverb;$('r62-track-low').value=t.low;$('r62-track-mid').value=t.mid;$('r62-track-high').value=t.high;
 $('r62-track-pan').value=t.pan;$('r62-clip').textContent=clipFor(selected)?.name||'LEER · SAMPLE LADEN';}
function applyTrack(key,value){S()?.updateTrack?.(selected,{[key]:value});updateTrackLabels()}
function updateTrackLabels(){const t=tracks()[selected];if(!t)return;for(const [k,unit] of Object.entries({volume:'',cut:'Hz',drive:'%',delay:'%',reverb:'%',low:'dB',mid:'dB',high:'dB',pan:''})){const e=$('r62-out-'+k);if(e)e.textContent=(Number(t[k]).toFixed(['volume'].includes(k)?2:0))+unit}}
function xyChange(ev){if(held)return;const rect=$('r62-xy').getBoundingClientRect();let x=clamp((ev.clientX-rect.left)/rect.width,0,1),y=clamp(1-(ev.clientY-rect.top)/rect.height,0,1);
 $('r62-dot').style.left=(x*100)+'%';$('r62-dot').style.top=((1-y)*100)+'%';
 const cutoff=Math.round(180*Math.pow(100,x));
 if(mode==='filter')S()?.updateTrack?.(selected,{cut:cutoff,reverb:Math.round(y*65*depth)});
 else if(mode==='drive')S()?.updateTrack?.(selected,{drive:Math.round(y*95*depth),cut:cutoff});
 else if(mode==='delay')S()?.updateTrack?.(selected,{delay:Math.round(y*85*depth),pan:Math.round((x-.5)*150)});
 else if(mode==='reverb')S()?.updateTrack?.(selected,{reverb:Math.round(y*95*depth),cut:cutoff});
 $('r62-xyread').textContent=`${modes[mode]}  X${Math.round(x*100)} Y${Math.round(y*100)}`;
 updateTrackDetails();updateTrackLabels();}
function fxPress(m){mode=m;document.querySelectorAll('[data-fxmode]').forEach(x=>x.classList.toggle('active',x.dataset.fxmode===mode));$('r62-fxdisplay').textContent=modes[mode].toUpperCase();status('FX '+modes[mode]+' · XY-Pad bewegen')}
function loadSample(){const src=selectedSample();if(!src)return status('Keine Sample-Auswahl');const t=tracks()[selected];if(!t)return;
 let c=clipFor(selected);if(c){c.kind='sample';c.sourceId=src.id;c.sampleIndex=src.index;c.name=src.name;c.notes=[];c.steps=c.steps?.length===16?c.steps:Array(16).fill(false)}
 else c=createClip(selected,'sample');if(!c)return;t.type='drum';c.kind='sample';c.sourceId=src.id;c.sampleIndex=src.index;c.name=src.name;S()?.refresh?.();renderGrid();renderArranger();status('Sample geladen: '+src.name)}
function playSample(){const src=selectedSample();if(!src)return;S()?.preview?.(src).then(()=>status('Vorhören: '+src.name)).catch(e=>status('Audio: '+e.message))}
function play(){S()?.play?.().then?.(()=>{renderTransport()});setTimeout(renderTransport,70)}
function renderTransport(){const P=current();if(!P)return;$('r62-bpm').value=P.bpm;$('r62-play').textContent=S()?.playing?.()?'Ⅱ PAUSE':'▶ PLAY';$('r62-play').classList.toggle('active',!!S()?.playing?.());$('r62-swing').value=P.swing}
function syncProject(){renderTransport();renderSamples();updateTrackDetails();updateTrackLabels();renderGrid();renderMixer();renderArranger();renderPiano();}
function octaveChange(delta){octave=clamp(octave+delta,1,6);renderPiano()}
function pianoTrack(){let pos=tracks().findIndex(t=>t.type==='synth');if(pos<0){S()?.addTrack?.('PIANO SYNTH','synth','sine');pos=tracks().length-1;}setTrack(pos);return tracks()[pos]}
function renderPiano(){if(!$('r62-keys'))return;const first=(octave+1)*12;const whites=[],keys=[];const whiteOffsets=[0,2,4,5,7,9,11,12,14,16,17,19,21,23,24];
 for(let i=0;i<14;i++)whites.push(`<button class="r62-white" data-note="${first+whiteOffsets[i]}" aria-label="Note ${first+whiteOffsets[i]}"><span>${[0,7].includes(i)?'C'+(octave+(i?1:0)):''}</span></button>`);
 $('r62-keys').innerHTML=whites.join('');
 for(let note=first;note<first+24;note++){let pc=note%12;if(![1,3,6,8,10].includes(pc))continue;const whitesBefore=Array.from({length:note-first+1},(_,i)=>first+i).filter(n=>![1,3,6,8,10].includes(n%12)).length;
 const x=(whitesBefore-.38)/14*100;keys.push(`<button class="r62-black" style="left:${x}%" data-note="${note}" aria-label="Halbton ${note}"></button>`)}
 $('r62-keys').insertAdjacentHTML('beforeend',keys.join(''));
 $('r62-oct').textContent=`C${octave}–C${octave+2}`;
 $('r62-keys').querySelectorAll('[data-note]').forEach(x=>{
 x.addEventListener('pointerdown',e=>{e.preventDefault();try{x.setPointerCapture(e.pointerId)}catch{} const note=+x.dataset.note;pianoTrack();window.EXTRIBE_PIANO61?.noteOn(note,.85,'rack'+e.pointerId);x.classList.add('key-down');if(record)recordNote(note)});
 const off=e=>{window.EXTRIBE_PIANO61?.noteOff(+x.dataset.note,'rack'+e.pointerId);x.classList.remove('key-down')};x.addEventListener('pointerup',off);x.addEventListener('pointercancel',off);x.addEventListener('lostpointercapture',off)})}
function recordNote(note){const pos=tracks().findIndex(x=>x.type==='synth');if(pos<0)return;S()?.selectTrack?.(pos);let c=clipFor(pos);if(!c||c.kind!=='synth')c=S()?.createPianoClip?.();if(!c)return;c.kind='synth';c.notes=c.notes||[];let step=S()?.playing?.()?S().transportTick()%16:recordStep++%16;c.notes.push({pitch:note,step,velocity:.85,duration:1});c.steps[step]=true;status(`Piano REC · Note ${note} · Step ${step+1}`);S()?.refresh?.();renderGrid()}
function synthPreset(){pianoTrack();window.EXTRIBE_PIANO61?.selectPreset?.($('r62-synthpreset').value);status('Synth-Sound: '+$('r62-synthpreset').value)}
function updateSynthParam(param,value){const t=pianoTrack();if(!t)return;const P61=window.EXTRIBE_PIANO61;const old=P61?.config?.(t)||{};t.synth61={...old,[param]:+value};const e=$('r62-synthout-'+param);if(e)e.textContent=param==='cut'?Math.round(value)+' Hz':Number(value).toFixed(2);P61?.renderParams?.()}
function renderSynth(){const t=tracks().find(x=>x.type==='synth');const p=window.EXTRIBE_PIANO61?.config?.(t)||{};if(p){for(const k of ['attack','decay','sustain','release','cut','resonance']){let inp=$('r62-synth-'+k);if(inp&&p[k]!==undefined){inp.value=p[k];$('r62-synthout-'+k).textContent=k==='cut'?Math.round(p[k])+' Hz':Number(p[k]).toFixed(2)}}}}
function open(){rack?.classList.remove('r62-hidden');S()?.show?.(true);syncProject();renderSynth();status('Hardware-Rack aktiv · echtes Audio über Studio 6.1')}
function close(){rack?.classList.add('r62-hidden');S()?.show?.(true)}
function fillUI(){if(rack)return;const root=document.createElement('section');root.id='rack62';root.setAttribute('aria-label','EX-TRIBE Hardware Workstation');
 root.innerHTML=`<div class="r62-surface">
 <header class="r62-title"><div class="r62-logo">EX<span>·</span>TRIBE <small>HARDWARE STUDIO 6.2</small></div><div class="r62-title-actions"><button id="r62-studio">▥ ARRANGER</button><button id="r62-new">⌫ NEU / LEER</button><button id="r62-demo">⚡ OST-BUNKER PRESET</button><button id="r62-save">▣ SPEICHERN</button><button id="r62-load">⇧ LADEN</button><button id="r62-wav">↓ SONG WAV</button><button id="r62-updates">⟳ UPDATE</button></div></header>
 <div class="r62-top"><div class="r62-screen-art"><div class="r62-geometry"><i></i><b>EX</b></div><span>ORIGINAL UNDERGROUND WORKSTATION</span></div><div class="r62-arranger"><div class="r62-label">▥ SONG ARRANGER <button id="r62-arr-open">EDITOR ÖFFNEN</button></div><div id="r62-song" class="r62-song"></div></div><div class="r62-topmix"><div class="r62-label">MASTER / TRANSPORT</div><div class="r62-controls"><button id="r62-play" class="r62-play">▶ PLAY</button><button id="r62-stop">■ STOP</button><label>BPM <input id="r62-bpm" inputmode="numeric" type="number" min="50" max="240" value="150"></label><label>SWING <input id="r62-swing" type="range" min="0" max="60" value="0"></label><div class="r62-barlabel">BAR <strong id="r62-bar">01</strong></div><button id="r62-barprev">◀</button><button id="r62-barnext">▶</button></div><div class="r62-signal" id="r62-signal">● AUDIO ENGINE</div></div></div>
 <div class="r62-main"><section class="r62-pane r62-fx"><div class="r62-label">◉ XY FX CONTROLLER <strong id="r62-fxdisplay">FILTER</strong></div><div class="r62-led-row">${Object.keys(modes).map((m,i)=>`<button class="r62-fxbtn ${i===0?'active':''}" data-fxmode="${m}"><span class="r62-lamp"></span>FX ${i+1}<small>${modes[m]}</small></button>`).join('')}</div><div class="r62-pad"><div class="r62-depth"><span>FX DEPTH</span><input id="r62-depth" type="range" min="0" max="1" step=".01" value=".75" aria-label="Effektstärke"></div><div id="r62-xy" class="r62-xy" role="slider" aria-label="XY Effektpad" tabindex="0"><div class="r62-pattern"></div><div id="r62-dot" class="r62-dot" style="left:78%;top:32%"></div></div><div class="r62-padrules"><button id="r62-hold">HOLD</button><button id="r62-fxreset">RESET</button><small id="r62-xyread">FILTER X78 Y68</small></div></div><div class="r62-infobox">Kaoss-artiger Effekt-Controller<br><span>XY bewegt echte Filter- und FX-Parameter.</span></div></section>
 <section class="r62-pane r62-sequencer"><div class="r62-label">▦ PERFORMANCE SEQUENCER <strong id="r62-clip">LEER</strong></div><div class="r62-seqtop"><span>TRACK / MUTE</span><span class="r62-stepnums">${Array.from({length:16},(_,i)=>`<b>${String(i+1).padStart(2,'0')}</b>`).join('')}</span></div><div id="r62-grid" class="r62-grid"></div><div class="r62-seqbottom"><button id="r62-clearsteps">⌫ STEPS LEEREN</button><button id="r62-addclip">＋ CLIP</button><button id="r62-double">▤ DUPLIZIEREN</button><button id="r62-piano-editor">🎹 PIANO ROLL</button><button id="r62-midi">⌁ MIDI LEARN</button></div><div class="r62-trackeditor"><div class="r62-label">CHANNEL EQ / DSP <strong id="r62-selected">DRUM 1</strong></div><div class="r62-eqgrid">${[['volume','LEVEL',0,1.25,.01],['cut','FILTER',180,18000,10],['drive','DRIVE',0,100,1],['delay','DELAY',0,100,1],['reverb','REVERB',0,100,1],['pan','PAN',-100,100,1],['low','LOW EQ',-18,18,1],['mid','MID EQ',-18,18,1],['high','HIGH EQ',-18,18,1]].map(([key,name,min,max,step])=>`<label>${name}<input id="r62-track-${key}" data-trackparam="${key}" type="range" min="${min}" max="${max}" step="${step}"><output id="r62-out-${key}">0</output></label>`).join('')}</div></div></section>
 <section class="r62-pane r62-sampler"><div class="r62-label">♫ SAMPLE SEQUENCER <span class="r62-sampleno">16 STEP</span></div><div class="r62-sample-display" id="r62-sample-name">KEIN SAMPLE</div><label class="r62-selectlabel">SAMPLE-BANK<select id="r62-packs"></select></label><label class="r62-selectlabel">ONE SHOT<select id="r62-samples"></select></label><div class="r62-sampler-actions"><button id="r62-preview">▶ PREVIEW</button><button id="r62-loadsample">＋ SAMPLE IN SPUR</button></div><div class="r62-compactseq" id="r62-compactseq"></div><div class="r62-sampler-labels"><span>1</span><span>4</span><span>8</span><span>12</span><span>16</span></div><div class="r62-note">Original Sample-Banks · neue Dateien über <b>STUDIO → IMPORT</b>.</div><div class="r62-mixerhead">MIXER / MUTE / SOLO</div><div class="r62-mixer" id="r62-mixer"></div></section></div>
 <section class="r62-piano"><div class="r62-piano-top"><div class="r62-piano-brand">▥ PIANO SYNTH <small>POLYPHONIC</small></div><select id="r62-synthpreset" aria-label="Synth-Sound">${presets.map(x=>`<option>${x}</option>`).join('')}</select><button id="r62-rec">● REC OFF</button><button id="r62-octdown">−</button><strong id="r62-oct">C3–C5</strong><button id="r62-octup">＋</button><button id="r62-piano-full">FULL SYNTH</button></div><div class="r62-piano-body"><div class="r62-synthknobs">${[['attack','ATTACK',.002,1.2,.01],['decay','DECAY',.02,2,.01],['sustain','SUSTAIN',0,1,.01],['release','RELEASE',.03,2.5,.01],['cut','CUTOFF',150,15000,10],['resonance','RESO',.5,12,.1]].map(([key,name,min,max,step])=>`<label>${name}<input id="r62-synth-${key}" data-synthparam="${key}" type="range" min="${min}" max="${max}" step="${step}"><output id="r62-synthout-${key}"></output></label>`).join('')}</div><div id="r62-keys" class="r62-keys" aria-label="Piano Klaviatur"></div></div></section>
 <footer class="r62-footer"><span id="r62-status" role="status" aria-live="polite">${lastStatus}</span><span>ANALOG-LOOK · WEB AUDIO DSP · 8 TRACKS · 16 STEPS · MIDI / DAW</span></footer></div>
 <nav class="r62-mobile-nav" aria-label="Mobile Modulsteuerung"><button data-r62-nav="fx">FX</button><button data-r62-nav="sequencer">STEP</button><button data-r62-nav="sampler">SAMPLE</button><button data-r62-nav="piano">PIANO</button><button data-r62-nav="studio">DAW</button><button data-r62-nav="play">▶</button></nav>`;
 document.body.append(root);rack=root;
 const on=(id,fn)=>$(id).addEventListener('click',fn);
 root.querySelectorAll('[data-r62-nav]').forEach(btn=>btn.onclick=()=>{const section=btn.dataset.r62Nav;if(section==='studio')return close();if(section==='play')return play();const target=section==='piano'?root.querySelector('.r62-piano'):root.querySelector('.r62-'+section);if(target){const rr=root.getBoundingClientRect(),tr=target.getBoundingClientRect();root.scrollBy({left:tr.left-rr.left-9,top:section==='piano'?tr.top-rr.top-8:-root.scrollTop,behavior:'smooth'})}});
 on('r62-studio',close);on('r62-arr-open',close);
 on('r62-demo',async()=>{await S()?.demo?.();selectBar(0);syncProject();status('OST-BUNKER PRESET · 8 Spuren geladen')});
 on('r62-new',()=>{if(confirm('Neues, komplett leeres Projekt anlegen? Nicht gespeicherte Änderungen gehen verloren.')){S()?.newProject?.();selected=0;bar=0;syncProject();status('Leeres Projekt gestartet')}});
 on('r62-save',async()=>{await S()?.saveLocal?.();status('Speichern ausgelöst · Backup über Studio-Menü empfohlen')});
 on('r62-load',async()=>{await S()?.loadLocal?.();syncProject();status('Gespeichertes Projekt geladen')});
 on('r62-wav',async()=>{status('Offline-WAV-Export startet …');await S()?.exportWav?.();status('WAV-Export abgeschlossen oder im Statusfenster prüfen')});
 on('r62-updates',()=>{close();$('updateButton')?.click()});
 on('r62-play',play);on('r62-stop',()=>{S()?.stop?.();renderTransport()});
 $('r62-bpm').onchange=e=>{S()?.setTempo?.(+e.target.value);renderTransport()};
 $('r62-swing').oninput=e=>{S()?.setSwing?.(+e.target.value)};
 on('r62-barprev',()=>selectBar(bar-2));on('r62-barnext',()=>selectBar(bar+2));
 root.querySelectorAll('[data-fxmode]').forEach(el=>el.onclick=()=>fxPress(el.dataset.fxmode));
 $('r62-depth').oninput=e=>depth=+e.target.value;
 const pad=$('r62-xy');pad.addEventListener('pointerdown',e=>{e.preventDefault();pad.setPointerCapture(e.pointerId);xyChange(e)});pad.addEventListener('pointermove',e=>{if(e.buttons||e.pointerType==='touch')xyChange(e)});pad.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();let dot=$('r62-dot'),x=parseFloat(dot.style.left)/100,y=1-parseFloat(dot.style.top)/100;x=clamp(x+(e.key==='ArrowRight'?.04:e.key==='ArrowLeft'?-.04:0),0,1);y=clamp(y+(e.key==='ArrowUp'?.04:e.key==='ArrowDown'?-.04:0),0,1);const r=pad.getBoundingClientRect();xyChange({clientX:r.left+x*r.width,clientY:r.top+(1-y)*r.height})});
 on('r62-hold',()=>{held=!held;$('r62-hold').classList.toggle('active',held);status(held?'XY-Effekt eingefroren':'XY-Effekt freigegeben')});
 on('r62-fxreset',()=>{S()?.updateTrack?.(selected,{cut:18000,drive:0,delay:0,reverb:0,pan:0});held=false;$('r62-hold').classList.remove('active');$('r62-dot').style.left='95%';$('r62-dot').style.top='0%';updateTrackDetails();updateTrackLabels()});
 $('r62-packs').onchange=e=>{pack=e.target.value;index=0;renderSamples()};$('r62-samples').onchange=e=>{index=+e.target.value;renderSamples()};
 on('r62-preview',playSample);on('r62-loadsample',loadSample);
 root.querySelectorAll('[data-trackparam]').forEach(el=>el.oninput=()=>applyTrack(el.dataset.trackparam,+el.value));
 on('r62-clearsteps',()=>{const c=clipFor(selected);if(!c)return status('Kein Clip auf der Spur');c.steps=Array(16).fill(false);c.notes=[];S()?.refresh?.();renderGrid();status('16 Steps geleert')});
 on('r62-addclip',()=>{createClip(selected);renderGrid();renderArranger()});
 on('r62-double',()=>{const t=tracks()[selected],c=clipFor(selected);if(!c)return status('Zuerst Clip wählen');const next=c.at+c.bars;if(t.clips.some(x=>next<x.at+x.bars&&next+c.bars>x.at)||next+c.bars>current().bars)return status('Kein Platz hinter diesem Clip');t.clips.push({...JSON.parse(JSON.stringify(c)),id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),at:next});S()?.refresh?.();renderArranger();status('Clip dupliziert')});
 on('r62-piano-editor',()=>{close();window.EXTRIBE_PIANO61?.open?.()});
 on('r62-midi',()=>{close();$('studio60')?.querySelector('#s6midi')?.click();const m=$('midiView');if(m)window.EXTRIBE_MIDI_API?.setView?.('midi')});
 on('r62-octdown',()=>octaveChange(-1));on('r62-octup',()=>octaveChange(1));
 on('r62-rec',()=>{record=!record;recordStep=0;$('r62-rec').classList.toggle('active',record);$('r62-rec').textContent=record?'● REC ON':'● REC OFF';status(record?'Klaviatur: Noten werden in Piano-Clip geschrieben':'Aufnahme beendet')});
 on('r62-piano-full',()=>{close();window.EXTRIBE_PIANO61?.open?.()});
 $('r62-synthpreset').onchange=synthPreset;
 root.querySelectorAll('[data-synthparam]').forEach(el=>el.oninput=()=>updateSynthParam(el.dataset.synthparam,el.value));
 const compact=$('r62-compactseq');compact.innerHTML=Array.from({length:16},(_,i)=>`<button data-compact="${i}" title="Step ${i+1}" aria-label="Sample Step ${i+1}"></button>`).join('');
 compact.querySelectorAll('button').forEach(e=>e.onclick=()=>{editStep(selected,+e.dataset.compact);renderCompact()});
 renderPiano();syncProject();renderSynth();
 gridTimers=setInterval(()=>{if(isActive()){renderTransport();renderCompact();const sg=$('r62-signal');sg.textContent=S()?.playing?.()?`● PLAY · ${String((S().transportTick()||0)%16+1).padStart(2,'0')}/16`:'● AUDIO BEREIT'}},400);
 const studio=$('studio60');const top=studio?.querySelector('.s6-top');if(top&&!studio.querySelector('#r62-return')){const btn=document.createElement('button');btn.id='r62-return';btn.textContent='▦ HARDWARE RACK';btn.className='r62-return';btn.onclick=open;top.prepend(btn)}
 }
function renderCompact(){const c=clipFor(selected),s=S()?.playing?.()?S().transportTick()%16:-1;$('r62-compactseq')?.querySelectorAll('[data-compact]').forEach((e,i)=>{e.classList.toggle('lit',!!c?.steps?.[i]);e.classList.toggle('playing',i===s)})}
window.EXTRIBE_RACK62={open,close,render:syncProject,chooseTrack:setTrack,xy:xyChange,editStep,loadSample,track:()=>selected,isOpen:isActive};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{fillUI();open()},{once:true});else{fillUI();open()}
})();
