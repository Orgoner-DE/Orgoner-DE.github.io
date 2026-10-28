/* EX-TRIBE PRO 5.4 | Song Arranger. 4 bank lanes, 64 bars, safe snapshots, Safari touch. */
(()=>{'use strict';
const API=window.EXTRIBE_MIDI_API,AUDIO=window.EXTRIBE_SONG_AUDIO;
const $=id=>document.getElementById(id), NB=4, NP=16, BAR=16, MAXBAR=64, PIX=58, BANK_NAMES='ABCD';
if(!API||!AUDIO||!$('song54Mount'))return;
const e=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let songEnabled=false,songPlaying=false,clock=null,atStep=0,audioTime=0,session=0;
let source={type:'bank',bank:0},selectedClip=null,focusIndex=0,pointerDrag=null,lastGhost=null,dragSuppressUntil=0;
const project=()=>AUDIO.getProject();
function state(){const p=project();if(!p.song)p.song={patterns:[],clips:[],loop:false};return p.song}
function newId(){return typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():'p'+Date.now().toString(36)+Math.random().toString(36).slice(2)}
function int(v,min,max,def=min){let n=Number(v);return Number.isInteger(n)&&n>=min&&n<=max?n:def}
function patternValid(raw){if(!raw||typeof raw!=='object'||!Array.isArray(raw.steps)||raw.steps.length!==NP)return null;let bank=int(raw.bank,0,3,0),length=raw.length===32?32:16;return {id:String(raw.id||newId()).slice(0,90),name:String(raw.name||'Pattern').slice(0,50),bank,length,steps:raw.steps.map(row=>Array.from({length:32},(_,i)=>!!(Array.isArray(row)&&row[i]))),source:raw.source==='bank'?'bank':'user'};}
function sanitize(raw){const out={patterns:[],clips:[],loop:false};if(!raw||typeof raw!=='object')return out;out.loop=!!raw.loop;
 const ids=new Set();for(const entry of (Array.isArray(raw.patterns)?raw.patterns:[]).slice(0,128)){const p=patternValid(entry);if(!p||ids.has(p.id))continue;ids.add(p.id);out.patterns.push(p)}
 const used=new Set();for(const item of (Array.isArray(raw.clips)?raw.clips:[]).slice(0,400)){if(!item||typeof item!=='object')continue;const pattern=out.patterns.find(x=>x.id===item.patternId);if(!pattern)continue;const bank=int(item.bank,0,3,pattern.bank),start=int(item.start,0,63,-1),bars=[1,2,4,8].includes(item.bars)?item.bars:1;
  if(start<0||start+bars>MAXBAR)continue;const id=String(item.id||newId()).slice(0,90);if(used.has(id)||out.clips.some(c=>c.bank===bank&&start<c.start+c.bars&&c.start<start+bars))continue;used.add(id);out.clips.push({id,patternId:pattern.id,bank,start,bars,muted:!!item.muted});}
 return out;
}
function usedEnd(){return Math.max(0,...state().clips.map(c=>c.start+c.bars))}
function tickCount(){return usedEnd()*BAR}
function sourceList(){const banks=Array.from({length:4},(_,bank)=>({type:'bank',bank,id:'bank-'+bank,name:'LIVE BANK '+BANK_NAMES[bank],desc:countBank(bank)+' STEPS'}));return banks.concat(state().patterns.map(p=>({type:'pattern',bank:p.bank,id:p.id,name:p.name,desc:'BANK '+BANK_NAMES[p.bank]+' · '+p.length+' STEPS'})))}
function countBank(bank){const p=project();return p.banks[bank].reduce((a,t)=>a+t.steps.slice(0,p.length).filter(Boolean).length,0)}
function choose(s){source={type:s.type,bank:s.bank,id:s.id};const list=sourceList();focusIndex=Math.max(0,list.findIndex(x=>x.type===s.type&&x.id===s.id));if(s.type==='bank')API.setBank(s.bank);renderSelection();}
function currentSource(){const xs=sourceList();return xs.find(x=>x.type===source.type&&x.id===source.id)||xs[0]}
function changeSelection(dir){const xs=sourceList();focusIndex=(focusIndex+dir+xs.length)%xs.length;choose(xs[focusIndex]);}
function capture(bank,name=null,fromBank=true){const s=state(),p=project();if(s.patterns.length>=96){message('Maximal 96 Patterns pro Projekt');return null}const steps=p.banks[bank].map(t=>t.steps.map(Boolean));if(!steps.some(row=>row.slice(0,p.length).some(Boolean))){message('Bank '+BANK_NAMES[bank]+' ist noch leer. Zuerst Steps setzen.');return null}
 const fingerprint=JSON.stringify({bank,length:p.length,steps:steps.map(row=>row.slice(0,p.length))});
 if(fromBank){const known=s.patterns.find(pt=>pt.source==='bank'&&pt.bank===bank&&JSON.stringify({bank:pt.bank,length:pt.length,steps:pt.steps.map(row=>row.slice(0,pt.length))})===fingerprint);if(known)return known;}
 const n=s.patterns.filter(pt=>pt.bank===bank).length+1;
 const entry={id:newId(),name:name||`BANK ${BANK_NAMES[bank]} PATTERN ${String(n).padStart(2,'0')}`,bank,length:p.length,steps,source:fromBank?'bank':'user'};
 s.patterns.push(entry);API.setDirty();return entry;
}
function materializeSource(src){if(!src)return null;if(src.type==='bank')return capture(src.bank,null,true);return state().patterns.find(p=>p.id===src.id)||null;}
function occupy(bank,start,bars,except=null){return state().clips.some(c=>c.id!==except&&c.bank===bank&&start<c.start+c.bars&&c.start<start+bars)}
function addClip(src,targetBank,start,bars){const clipBars=[1,2,4,8].includes(bars)?bars:2;
 if(targetBank<0||targetBank>3||start<0||start+clipBars>MAXBAR){message('Außerhalb der 64 Takte');return false}
 if(state().clips.length>=256){message('Maximal 256 Clips');return false}
 if(occupy(targetBank,start,clipBars)){message('Spur belegt. Anderen Takt wählen oder Clip verschieben.');return false}
 const p=materializeSource(src);if(!p)return false;
 // The sample assignment remains in the source bank; a different target lane would play mismatched samples.
 if(targetBank!==p.bank){message('Pattern gehört zu Bank '+BANK_NAMES[p.bank]+'. Wähle deren Spur.');return false}
 const clip={id:newId(),patternId:p.id,bank:targetBank,start,bars:clipBars,muted:false};state().clips.push(clip);selectedClip=clip.id;API.setDirty();render();return true;
}
function selectedSource(){return currentSource()}
function barLength(){return int($('song54Duration').value,1,8,2)}
function putAtEnd(){const src=selectedSource();const pos=usedEnd();if(pos>=MAXBAR)return message('64 Takte erreicht');const bars=Math.min(barLength(),MAXBAR-pos);if(![1,2,4,8].includes(bars))return message('Clip-Länge für das Ende verkleinern');const p=src.type==='pattern'?state().patterns.find(x=>x.id===src.id):null;const lane=src.bank;
 if(addClip(src,lane,pos,bars))scrollToBar(pos);
}
function setClipSelected(id){selectedClip=id;renderTimeline();renderClipTools()}
function moveClip(c,bank,start){if(!c)return false;if(bank!==c.bank){message('Clip kann nur innerhalb seiner Bank verschoben werden');return false}
 if(start<0||start+c.bars>MAXBAR||occupy(bank,start,c.bars,c.id)){message('Ziel ist belegt oder außerhalb der Timeline');return false}
 c.start=start;API.setDirty();render();return true;
}
function duplicateClip(){const c=state().clips.find(c=>c.id===selectedClip);if(!c)return;const pos=c.start+c.bars;if(pos+c.bars>MAXBAR||occupy(c.bank,pos,c.bars))return message('Für eine Kopie ist kein Platz direkt dahinter');const copy={...c,id:newId(),start:pos};state().clips.push(copy);selectedClip=copy.id;API.setDirty();render();}
function deleteClip(){const clips=state().clips,ix=clips.findIndex(c=>c.id===selectedClip);if(ix<0)return;clips.splice(ix,1);selectedClip=null;API.setDirty();render()}
function toggleMuteClip(){const c=state().clips.find(x=>x.id===selectedClip);if(!c)return;c.muted=!c.muted;API.setDirty();render()}
function deletePattern(){const s=state(),src=selectedSource();if(src.type!=='pattern')return message('Ein gespeichertes Pattern auswählen');if(s.clips.some(c=>c.patternId===src.id))return message('Pattern liegt im Song. Erst seine Clips entfernen.');s.patterns=s.patterns.filter(p=>p.id!==src.id);source={type:'bank',id:'bank-'+src.bank,bank:src.bank};API.setDirty();render()}
function applyPattern(){const src=selectedSource(),p=state().patterns.find(x=>x.id===src.id);if(!p)return message('Gespeichertes Pattern auswählen');if(songPlaying)stop();
 const pr=project();pr.length=p.length;for(let i=0;i<16;i++)pr.banks[p.bank][i].steps=p.steps[i].slice();API.setBank(p.bank);API.updateControls();API.setDirty();message('Pattern-Noten in Bank '+BANK_NAMES[p.bank]+' geladen');render();}
function message(text){const el=$('song54Info');if(el)el.textContent=text;}
function renderUI(){const m=$('song54Mount');m.innerHTML=`<div class="song54"><div class="song54-head"><div><span class="eyebrow">EX-TRIBE PRO 5.4 · SONG ARRANGER</span><h2>BANKS → PATTERNS → DEIN SONG</h2><p>Wischen, auswählen, auf Takt tippen oder Pattern-Chip in die Spur ziehen.</p></div><button id="song54Mode" class="song54-switch" aria-pressed="false">◉ SONG-MODUS AUS</button></div>
 <div class="song54-browser"><div class="song54-nav"><button id="song54Prev" aria-label="Vorherige Bank oder Pattern">‹</button><div id="song54Focus" class="song54-focus" tabindex="0" role="button" aria-label="Pattern-Auswahl. Links oder rechts wischen."><div><strong id="song54Name">LIVE BANK A</strong><small id="song54Description">Bank A</small></div><span style="color:#afffcf;font-size:16px">⇆</span></div><button id="song54Next" aria-label="Nächste Bank oder Pattern">›</button></div><div class="song54-swipe-note">⇆ WISCHE LINKS / RECHTS: Banks A–D und gespeicherte Patterns durchschalten</div><div id="song54Sources" class="song54-sources" aria-label="Pattern- und Bank-Auswahl"></div></div>
 <div class="song54-tools"><button class="emphasis" id="song54Capture">＋ PATTERN SICHERN</button><button id="song54Use">↧ PATTERN IN BANK LADEN</button><button id="song54DeletePattern" class="danger">⌫ PATTERN LÖSCHEN</button><label>CLIP-LÄNGE <select id="song54Duration" aria-label="Länge des neuen Clips in Takten"><option value="1">1 TAKT</option><option value="2" selected>2 TAKTE</option><option value="4">4 TAKTE</option><option value="8">8 TAKTE</option></select></label><button class="emphasis" id="song54Append">＋ ANS SONG-ENDE</button></div>
 <div class="song54-tools"><button class="emphasis" id="song54Play">▶ SONG SPIELEN</button><button id="song54Stop">■ STOP</button><button id="song54Wav">⇩ SONG ALS WAV</button><label><input type="checkbox" id="song54Loop"> SONG WIEDERHOLEN</label></div>
 <p id="song54Info" class="song54-info" role="status" aria-live="polite">Wähle ein Pattern und tippe auf einen freien Takt. Pro Bank eine eigene Spur, bis 64 Takte.</p>
 <div class="song54-scroll" id="song54Scroll" aria-label="64 Takte; horizontal scrollbar"><div class="song54-grid"><div id="song54Ruler" class="song54-ruler"></div><div id="song54Timeline"></div></div></div>
 <div id="song54ClipTools" class="song54-clip-tools" hidden></div>
 <div id="song54Summary" class="song54-summary">0 Clips · 0 Takte</div></div>`;
 $('song54Prev').onclick=()=>changeSelection(-1);$('song54Next').onclick=()=>changeSelection(1);
 $('song54Mode').onclick=()=>enable(!songEnabled);
 $('song54Capture').onclick=()=>{const s=selectedSource(),b=s.bank;const name=prompt('Pattern-Name',`BANK ${BANK_NAMES[b]} · PATTERN`);if(name===null)return;const p=capture(b,String(name).trim().slice(0,50)||null,false);if(p){source={type:'pattern',id:p.id,bank:p.bank};render();message('Pattern gesichert: '+p.name)}};
 $('song54Use').onclick=applyPattern;$('song54DeletePattern').onclick=deletePattern;
 $('song54Append').onclick=putAtEnd;
 $('song54Play').onclick=()=>{enable(true);togglePlay()};$('song54Stop').onclick=stop;$('song54Wav').onclick=exportWav;
 $('song54Loop').onchange=ev=>{state().loop=ev.target.checked;API.setDirty()};
 const focus=$('song54Focus');attachSwipe(focus,changeSelection);focus.addEventListener('keydown',ev=>{if(ev.key==='ArrowLeft'){changeSelection(-1);ev.preventDefault()}if(ev.key==='ArrowRight'){changeSelection(1);ev.preventDefault()}});
 const padGrid=$('padGrid');attachSwipe(padGrid,dir=>{const b=(API.getBank()+dir+NB)%NB;choose({type:'bank',bank:b,id:'bank-'+b})});
 // Tapping an empty bar inserts the selected pattern. Drag/drop works on desktop and on touch devices.
 $('song54Timeline').onclick=ev=>{if(Date.now()<dragSuppressUntil)return;const clipEl=ev.target.closest('.song54-clip');if(clipEl){setClipSelected(clipEl.dataset.id);return}const cell=ev.target.closest('.song54-cell');if(cell)addClip(selectedSource(),+cell.dataset.bank,+cell.dataset.bar,barLength())};
 $('song54Timeline').addEventListener('dragover',ev=>{if(ev.target.closest('.song54-cell,.song54-lane'))ev.preventDefault()});
 $('song54Timeline').addEventListener('drop',ev=>{ev.preventDefault();const payload=ev.dataTransfer?.getData('text/plain')||'';let src;try{src=JSON.parse(payload)}catch{return}const destination=locationAt(ev.clientX,ev.clientY);if(destination)addClip(src,destination.bank,destination.bar,barLength())});
 $('song54Sources').onclick=ev=>{if(Date.now()<dragSuppressUntil)return;const c=ev.target.closest('.song54-source');if(c){choose(JSON.parse(c.dataset.source))}};
 $('song54Sources').addEventListener('dragstart',ev=>{const c=ev.target.closest('.song54-source');if(!c)return;ev.dataTransfer.setData('text/plain',c.dataset.source);ev.dataTransfer.effectAllowed='copy'});
 $('song54Sources').addEventListener('pointerdown',dragStart);
 window.addEventListener('pointermove',dragMove,{passive:false});window.addEventListener('pointerup',dragEnd);window.addEventListener('pointercancel',dragAbort);
}
function attachSwipe(el,fn){let down=null;el.addEventListener('pointerdown',ev=>{if(ev.target.closest('button,input,select'))return;down={x:ev.clientX,y:ev.clientY}});el.addEventListener('pointerup',ev=>{if(!down)return;const dx=ev.clientX-down.x,dy=ev.clientY-down.y;down=null;if(Math.abs(dx)>=50&&Math.abs(dx)>Math.abs(dy)*1.3){fn(dx<0?1:-1);dragSuppressUntil=Date.now()+230}});el.addEventListener('pointercancel',()=>down=null)}
function locationAt(x,y){const el=document.elementFromPoint(x,y);if(!el)return null;const cell=el.closest('.song54-cell');if(cell)return {bank:+cell.dataset.bank,bar:+cell.dataset.bar};
 const clip=el.closest('.song54-clip'),lane=el.closest('.song54-lane');if(!lane)return null;const track=lane.querySelector('.song54-cells');const rect=track.getBoundingClientRect();return {bank:+lane.dataset.bank,bar:Math.max(0,Math.min(63,Math.floor((x-rect.left)/PIX)))};}
function dragStart(ev){const el=ev.target.closest('.song54-source');if(!el||ev.pointerType==='mouse')return;pointerDrag={id:ev.pointerId,x:ev.clientX,y:ev.clientY,src:JSON.parse(el.dataset.source),drag:false};}
function dragMove(ev){const d=pointerDrag;if(!d||d.id!==ev.pointerId)return;const dx=ev.clientX-d.x,dy=ev.clientY-d.y;if(!d.drag&&Math.hypot(dx,dy)<10)return;if(!d.drag){d.drag=true;lastGhost=document.createElement('div');lastGhost.className='song54-float';lastGhost.textContent=d.clipId?'↔ CLIP VERSCHIEBEN':'＋ '+(d.src.type==='bank'?`BANK ${BANK_NAMES[d.src.bank]}`:'PATTERN');document.body.append(lastGhost)}lastGhost.style.left=Math.round(ev.clientX+12)+'px';lastGhost.style.top=Math.round(ev.clientY-24)+'px';}
function dragAbort(){pointerDrag=null;if(lastGhost){lastGhost.remove();lastGhost=null}}
function dragEnd(ev){const d=pointerDrag;if(!d||d.id!==ev.pointerId)return;pointerDrag=null;if(lastGhost){lastGhost.remove();lastGhost=null}if(d.drag){dragSuppressUntil=Date.now()+350;const location=locationAt(ev.clientX,ev.clientY);if(location){if(d.clipId){const clip=state().clips.find(c=>c.id===d.clipId);if(clip)moveClip(clip,location.bank,location.bar)}else addClip(d.src,location.bank,location.bar,barLength())}}}
function renderSelection(){const s=selectedSource(),xs=sourceList();focusIndex=Math.max(0,xs.findIndex(x=>x.id===s.id&&x.type===s.type));$('song54Name').textContent=s.name;$('song54Description').textContent=s.desc+' · '+(focusIndex+1)+' / '+xs.length;
 const root=$('song54Sources');root.replaceChildren(...xs.map(x=>{const b=document.createElement('button');b.type='button';b.className='song54-source'+(s.id===x.id&&s.type===x.type?' active':'');b.dataset.source=JSON.stringify({type:x.type,bank:x.bank,id:x.id});b.draggable=true;const title=document.createElement('strong');title.textContent=x.name;const sub=document.createElement('small');sub.textContent=x.desc;b.append(title,sub);return b}));}
function renderTimeline(){const top=$('song54Ruler');top.replaceChildren();const corner=document.createElement('span');corner.className='song54-label';corner.textContent='BANK / TAKT';top.append(corner);
 for(let bar=0;bar<MAXBAR;bar++){const div=document.createElement('span');div.className='song54-bar';div.textContent=String(bar+1).padStart(2,'0');top.append(div)}
 const root=$('song54Timeline');root.replaceChildren();const s=state();for(let b=0;b<NB;b++){
  const lane=document.createElement('div');lane.className='song54-lane';lane.dataset.bank=b;const title=document.createElement('div');title.className='song54-label';title.textContent='BANK '+BANK_NAMES[b];const cells=document.createElement('div');cells.className='song54-cells';
  for(let j=0;j<MAXBAR;j++){const c=document.createElement('button');c.type='button';c.className='song54-cell';c.dataset.bar=j;c.dataset.bank=b;c.setAttribute('aria-label',`Bank ${BANK_NAMES[b]}, Takt ${j+1} (Pattern hinzufügen)`);cells.append(c)}
  for(const c of s.clips.filter(x=>x.bank===b)){
   const p=s.patterns.find(x=>x.id===c.patternId);if(!p)continue;
   const clip=document.createElement('button');clip.className='song54-clip'+(c.id===selectedClip?' selected':'')+(c.muted?' muted':'');clip.type='button';clip.dataset.id=c.id;clip.dataset.bank=b;clip.style.left=(c.start*PIX+2)+'px';clip.style.width=(c.bars*PIX-4)+'px';clip.setAttribute('aria-label',`${p.name}, Bank ${BANK_NAMES[b]}, Takt ${c.start+1}, Länge ${c.bars}. Bearbeiten`);
   const label=document.createElement('strong');label.textContent=p.name;const sub=document.createElement('small');sub.textContent=`${c.bars} Takt${c.bars!==1?'e':''}${c.muted?' · MUTE':''}`;clip.append(label,sub);cells.append(clip);
   clip.setAttribute('draggable','true');clip.addEventListener('dragstart',ev=>{ev.dataTransfer.setData('application/x-songclip',c.id);ev.dataTransfer.effectAllowed='move'});
   clip.addEventListener('pointerdown',ev=>{if(ev.pointerType==='mouse')return;pointerDrag={id:ev.pointerId,x:ev.clientX,y:ev.clientY,clipId:c.id,drag:false}});
  }
  const play=document.createElement('div');play.className='song54-playhead';play.dataset.playbank=b;cells.append(play);lane.append(title,cells);root.append(lane);
 }
 // Moving existing clips by mouse drag is distinct from inserting pattern sources.
 root.querySelectorAll('.song54-lane').forEach(lane=>{lane.addEventListener('dragover',ev=>ev.preventDefault());lane.addEventListener('drop',ev=>{const id=ev.dataTransfer?.getData('application/x-songclip');if(!id)return;ev.preventDefault();ev.stopPropagation();const c=state().clips.find(x=>x.id===id);const loc=locationAt(ev.clientX,ev.clientY);if(c&&loc)moveClip(c,loc.bank,loc.bar)})});
}
function renderClipTools(){const box=$('song54ClipTools'),c=state().clips.find(x=>x.id===selectedClip);box.hidden=!c;box.replaceChildren();if(!c)return;const p=state().patterns.find(x=>x.id===c.patternId);
 const info=document.createElement('strong');info.textContent=`${p?.name||'Pattern'} · Bank ${BANK_NAMES[c.bank]} · Takt ${c.start+1}`;box.append(info);
 const actions=[['↻ DUPLIZIEREN',duplicateClip],[(c.muted?'● CLIP AN':'● CLIP MUTE'),toggleMuteClip],['− ENTFERNEN',deleteClip]];
 for(const [title,fn] of actions){const btn=document.createElement('button');btn.textContent=title;btn.onclick=fn;box.append(btn)}
 const minus=document.createElement('button');minus.textContent='‹ VERSCHIEBEN';minus.onclick=()=>moveClip(c,c.bank,c.start-1);box.append(minus);
 const plus=document.createElement('button');plus.textContent='VERSCHIEBEN ›';plus.onclick=()=>moveClip(c,c.bank,c.start+1);box.append(plus);
}
function scrollToBar(i){const sc=$('song54Scroll');if(sc)sc.scrollTo({left:Math.max(0,i*PIX-80),behavior:'smooth'})}
function render(){if(!$('song54Ruler'))return;const b=$('song54Mode');b.classList.toggle('active',songEnabled);b.setAttribute('aria-pressed',String(songEnabled));b.textContent=songEnabled?'● SONG-MODUS AN':'◉ SONG-MODUS AUS';$('song54Loop').checked=state().loop;
 renderSelection();renderTimeline();renderClipTools();$('song54Summary').textContent=`${state().clips.length} Clips · ${usedEnd()} von ${MAXBAR} Takten · ${state().patterns.length} gespeicherte Patterns`;
 $('song54Play').textContent=songPlaying?'Ⅱ SONG PAUSE':'▶ SONG SPIELEN';}
function enable(flag=true){songEnabled=!!flag;if(!songEnabled)stop();render()}
function active(){return songEnabled}
function eventsAt(step){const song=state(),bar=Math.floor(step/BAR);const active=song.clips.filter(c=>!c.muted&&bar>=c.start&&bar<c.start+c.bars);const events=[];
 for(const clip of active){const p=song.patterns.find(pt=>pt.id===clip.patternId);if(!p)continue;const local=(step-clip.start*BAR)%p.length;
  for(let i=0;i<NP;i++){if(p.steps[i][local])events.push({bank:clip.bank,pad:i})}
 }
 return events;
}
function progress(step){const bar=Math.floor(step/BAR);const text=`TAKT ${String(bar+1).padStart(2,'0')} / ${Math.max(1,usedEnd())}`;$('stepCounter').textContent=text;
 for(const node of document.querySelectorAll('.song54-playhead')){node.style.left=(bar*PIX+Math.floor((step%16)*PIX/16))+'px';node.style.display='block'}
 if(step%16===0){const sc=$('song54Scroll');if(sc){const pos=bar*PIX;if(pos>sc.scrollLeft+sc.clientWidth-100||pos<sc.scrollLeft){sc.scrollLeft=Math.max(0,pos-180)}}}
}
function stop(){if(clock){clearInterval(clock);clock=null}if(!songPlaying)return;songPlaying=false;session++;$('playButton').innerHTML='▶ <span>PLAY</span>';$('playButton').classList.remove('playing');$('song54Play').textContent='▶ SONG SPIELEN';for(const node of document.querySelectorAll('.song54-playhead'))node.style.display='none';}
function scheduler(){if(!songPlaying)return;const ac=AUDIO.getCtx(),total=tickCount();if(!ac||!total){stop();return}let n=0;
 while(audioTime<ac.currentTime+.12&&n++<36){if(atStep>=total){if(state().loop)atStep=0;else {if(audioTime<=ac.currentTime+.12){const token=session;setTimeout(()=>{if(session===token)stop()},Math.max(10,(audioTime-ac.currentTime)*1000))}return}}
  const step=atStep,when=audioTime;for(const ev of eventsAt(step)){const t=project().banks[ev.bank][ev.pad];if(t.buffer&&!t.mute)AUDIO.trigger(t,when)}
  const token=session;setTimeout(()=>{if(songPlaying&&session===token)progress(step)},Math.max(0,(when-ac.currentTime)*1000));
  const duration=60/Math.max(40,project().bpm)/4,swing=Math.max(0,Math.min(.6,project().swing/100));audioTime+=duration*(step%2===0?1+swing:1-swing);atStep++;
 }
}
async function togglePlay(){if(songPlaying){stop();return}if(!state().clips.length){message('Noch kein Song-Clip. Pattern wählen und in die Timeline setzen.');return}
 AUDIO.stopBank();try{const ac=await AUDIO.resumeAudio();songPlaying=true;session++;atStep=0;audioTime=ac.currentTime+.06;
 $('playButton').innerHTML='Ⅱ <span>PAUSE</span>';$('playButton').classList.add('playing');$('song54Play').textContent='Ⅱ SONG PAUSE';clock=setInterval(scheduler,25);scheduler();}catch(err){stop();message('Audio konnte nicht gestartet werden: '+err.message)}
}
// Offline renderer follows the existing FX chain, keeping clips and bank samples separated.
async function exportWav(){const count=tickCount();if(!count){message('Füge erst Pattern-Clips in die Song-Timeline ein');return}
 const P=project(),rate=32000,total=60/P.bpm*4*usedEnd();if(total>150){message('Song für mobilen WAV-Export zu lang (max. 150 Sekunden). Verkürze den Song oder erhöhe BPM.');return}
 const Offline=window.OfflineAudioContext||window.webkitOfflineAudioContext;
 if(!Offline){message('Dieser Browser unterstützt keinen Offline-Audioexport');return}
 $('song54Wav').disabled=true;message('Rendere Song-WAV inklusive Effekte …');
 try{const c=new Offline(2,Math.ceil(rate*(total+3)),rate);const bus=c.createGain(),comp=c.createDynamicsCompressor(),master=c.createGain();comp.threshold.value=-8;comp.knee.value=8;comp.ratio.value=10;comp.attack.value=.004;comp.release.value=.16;master.gain.value=P.master/100;
 const dry=c.createGain(),wet=c.createGain(),clip=c.createWaveShaper();clip.curve=window.EXTRIBE_FX53.makeCurve(1+(P.masterDrive||0)/16);clip.oversample='2x';const hasClip=P.fx&&P.masterDrive>0;dry.gain.value=hasClip?0:1;wet.gain.value=hasClip?1:0;comp.connect(dry);dry.connect(master);comp.connect(clip);clip.connect(wet);wet.connect(master);master.connect(c.destination);
 if(P.fx){const filter=c.createBiquadFilter(),main=c.createGain(),send=c.createGain(),delay=c.createDelay(1),feedback=c.createGain(),ret=c.createGain();filter.type='lowpass';filter.frequency.value=P.filter;send.gain.value=P.delay/100;delay.delayTime.value=.235;feedback.gain.value=.22;ret.gain.value=.44;bus.connect(filter);filter.connect(main);main.connect(comp);filter.connect(send);send.connect(delay);delay.connect(ret);ret.connect(comp);delay.connect(feedback);feedback.connect(delay)}else bus.connect(comp);
 let at=0,notes=0;const stepDur=60/P.bpm/4;for(let s=0;s<count;s++){
  for(const ev of eventsAt(s)){const t=P.banks[ev.bank][ev.pad];if(!t.buffer||t.mute||t.volume<=0)continue;const src=c.createBufferSource(),g=c.createGain();src.buffer=t.buffer;g.gain.value=t.volume/100;src.connect(g);const chain=P.fx?window.EXTRIBE_FX53.connectTrack(c,g,bus,t.fxMode||'dry',at,t.buffer.duration):null;if(!chain)g.connect(bus);src.start(at);notes++}
  at+=stepDur*(s%2===0?1+P.swing/100:1-P.swing/100)
 }
 if(!notes){message('Keine hörbaren Samples im Arrangement. Erst Sounds und Steps laden.');return}
 const result=await c.startRendering();const wav=AUDIO.wavFromBuffer(result);await AUDIO.saveBlob(wav,`${AUDIO.niceName()}-SONG-5.4.wav`);message('Song-WAV exportiert: '+usedEnd()+' Takte · '+notes+' Sample-Triggers');
 }catch(err){message('Song-WAV-Export fehlgeschlagen: '+err.message)}finally{$('song54Wav').disabled=false}}
function loaded(){stop();songEnabled=false;selectedClip=null;source={type:'bank',bank:0,id:'bank-0'};render()}
function bankChanged(b){if(source.type==='bank'){source={type:'bank',bank:b,id:'bank-'+b};renderSelection()}}
window.EXTRIBE_SONG={sanitize,snapshot:()=>sanitize(state()),render,loaded,bankChanged,enable,active,stop,togglePlay,exportWav,eventsAt};
window.EXTRIBE_SONG_TEST={snapshot:()=>JSON.parse(JSON.stringify(state())),capture,choose,addClip,moveClip,eventsAt,exportWav,enable,play:togglePlay,stop,sourceList,barLength,render,selected:()=>selectedSource(),usedEnd,playing:()=>songPlaying};
renderUI();render();
window.addEventListener('pagehide',stop);document.addEventListener('visibilitychange',()=>{if(document.hidden)stop()});
})();
