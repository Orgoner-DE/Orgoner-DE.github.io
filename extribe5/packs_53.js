/* EX-TRIBE 5.3 | original, reproducible 16-bit PCM sound synthesis. No third-party recordings. */
(()=>{'use strict';
const packs=[
{id:'clubrumble53',name:'CLUB RUMBLE 53 · SUB SYSTEM',subtitle:'Trockenes Kick-Attack, getrennte Bass-Tails, transparente Offbeat-Drums.',bpm:138,ref:['Peak-Time Club','Tuned Rumble','Warehouse'],seed:193,base:47,drive:1.5,tail:1.2,metal:.08},
{id:'berlinpressure53',name:'BERLIN PRESSURE · RAW 53',subtitle:'Hart verzerrte Kicks, kurze Rave-Stabs und dunkle Industrial-Texturen.',bpm:155,ref:['Berlin Warehouse','Hardtechno','Industrial'],seed:361,base:51,drive:3.5,tail:.92,metal:.32},
{id:'iron53',name:'SCHRANZ IRON · MACHINE',subtitle:'Schiebende Percussion, Metall-Rides und repetitive Kick-Grooves.',bpm:152,ref:['Schranz','Chris Liebing (Stil)','DJ Rush (Stil)'],seed:417,base:52,drive:3.1,tail:.84,metal:.47},
{id:'gabba53',name:'ROTTERDAM GABBA · HARD EDGE',subtitle:'Übersteuerte Kick-Tails, Hoover und rasante Hardcore-Drums.',bpm:184,ref:['Gabber','Hardcore','Rotterdam'],seed:537,base:55,drive:6.2,tail:.81,metal:.25},
{id:'trapnight53',name:'TRAP 808 · NIGHT DRIVE',subtitle:'Lang ausklingende 808er, präzise Snare, Hat-Rolls und düstere Stabs.',bpm:144,ref:['Trap','808 Glide','Half-Time'],seed:612,base:43,drive:1.7,tail:1.8,metal:.11},
{id:'osttekk53',name:'OST TEKK · BOUNCE LAB',subtitle:'Springende Kicks, rauer Bounce, spitze Hats und versetzte FX-Hits.',bpm:176,ref:['East German Hardtekk','Bounce','Tekk'],seed:784,base:58,drive:2.9,tail:.83,metal:.36}
];
const names=['KICK MAIN','KICK ATTACK','KICK CRUNCH','KICK RUMBLE','SUB NOTE','BASS ROLL','BASS GROWL','808 BEND','CLAP / SNAP','SNARE / CRACK','HAT SHORT','HAT OPEN','RIDE / SHUFFLE','TOM / IRON','STAB / HOOVER','RISER / IMPACT'];
for(const p of packs)p.samples=names.map((name,i)=>({name,file:`extra53/${p.id}/${String(i+1).padStart(2,'0')}-${name.toLowerCase().replace(/[^a-z0-9]+/g,'-')}.wav`}));
const RATE=44100;
function makeWave(p,index){
 if(!Number.isInteger(index)||index<0||index>=16)throw Error('Invalid sample number');
 let state=(0x6a57f00d+p.seed*1013+index*7919)>>>0;
 const random=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return ((state>>>0)/2147483648)-1;};
 const seconds=[.52,.34,.41,.89,1.18,.67,.54,1.39,.31,.28,.13,.48,.55,.51,.66,1.22][index]*(index===7?p.tail:1);
 const length=Math.round(seconds*RATE),samples=new Float32Array(length);
 let phase=0,noiseLP=0,metalPhase=0,prevR=0,peak=0;
 const base=p.base+(index===1?6:0),gabba=p.id==='gabba53',trap=p.id==='trapnight53';
 for(let n=0;n<length;n++){
  const time=n/RATE,progress=n/(length-1),r=random(),n2=random();
  noiseLP+=.033*(r-noiseLP);
  let sound=0;
  if(index<=3){
    const pitch=base+(index===1?260:index===2?205:175)*Math.exp(-time*(index===3?18:43));
    phase+=2*Math.PI*pitch/RATE;
    let body=Math.sin(phase)+.16*Math.sin(2.01*phase)+.05*Math.sin(3.1*phase);
    const decay=(index===3?5.3:8.8)/p.tail;
    body*=Math.exp(-time*decay);
    if(index===2||gabba)body=Math.tanh(body*p.drive*(gabba?2.2:1.5));
    const transient=(r-prevR)*.065*Math.exp(-time*117);
    sound=body+transient;
    if(index===3){const wobble=Math.sin(2*Math.PI*(base*.71)*time)*Math.exp(-time*3.6);sound+=wobble*.28+noiseLP*.18*Math.exp(-time*6);}
  } else if(index<=7){
    const f=(index===7?base*.66:index===4?base*.77:base*(index===5?1.4:2.1));
    const glide=index===7?(1.52-.57*(1-Math.exp(-time*7))):index===5?(1+.2*Math.exp(-time*14)):1;
    phase+=2*Math.PI*f*glide/RATE;
    const env=Math.exp(-time*(index===7?1.9:index===4?3.4:index===6?10.5:5)/p.tail);
    sound=(Math.sin(phase)+.21*Math.sin(2.04*phase))*env;
    if(index===6||index===5||gabba)sound=Math.tanh(sound*p.drive*.65);
    if(trap&&index===7)sound=Math.tanh(sound*1.4);
  } else if(index===8||index===9){
    const env=Math.exp(-time*(index===8?23:27));
    const snap=(r-prevR)*.55+r*.19;
    sound=snap*env+.23*Math.sin(2*Math.PI*(index===8?200:178)*time)*Math.exp(-time*42);
    if(index===8&&time>.027&&time<.07)sound+=n2*.35*Math.exp(-(time-.027)*42);
  } else if(index<=12){
    const env=Math.exp(-time*([0,0,0,0,0,0,0,0,0,0,64,16,13][index]));
    sound=(index===12?(r-prevR)*.7+noiseLP*.44:(r-prevR)*.9)*env;
    if(index===12)sound+=.09*Math.sin(2*Math.PI*4410*time)*Math.exp(-time*9);
  } else if(index===13){
    metalPhase+=2*Math.PI*(126+58*Math.exp(-time*11))/RATE;
    sound=(.35*Math.sin(metalPhase)+.25*Math.sin(2.19*metalPhase)+.17*Math.sin(4.32*metalPhase)+r*(.18+p.metal*.35))*Math.exp(-time*14);
  } else if(index===14){
    phase+=2*Math.PI*(base*2.7+170*Math.exp(-time*19))/RATE;
    let h=Math.sin(phase)+.41*Math.sin(phase*2.009)+.22*Math.sin(phase*3.17);
    if(gabba)h+=.34*Math.sin(phase*1.007+Math.sin(time*52)*.9);
    sound=Math.tanh(h*p.drive*.58)*Math.exp(-time*7.6);
  } else {
    phase+=2*Math.PI*(190+540*progress)/RATE;
    const rush=(.35*Math.sin(phase)+.31*r+noiseLP*.4);
    sound=rush*(.2+.8*Math.sin(Math.PI*progress))*(1-progress)+.22*Math.sin(2*Math.PI*(33+60*progress)*time)*Math.exp(-time*3.8);
  }
  if(p.id==='iron53'&&index>=8&&index<14)sound=Math.tanh((sound+r*.06*Math.exp(-time*7))*1.75);
  if(gabba&&(index<4||index===14))sound=Math.tanh(sound*2.5);
  if(p.id==='osttekk53'&&index<=3)sound+=(Math.sin(2*Math.PI*89*time)*.08)*Math.exp(-time*24);
  if(p.id==='berlinpressure53'&&(index===13||index===15))sound=Math.tanh(sound*2);
  sound*=Math.min(1,n/(RATE*.003),(length-1-n)/(RATE*.012));
  if(!Number.isFinite(sound))sound=0;
  samples[n]=sound;peak=Math.max(peak,Math.abs(sound));prevR=r;
 }
 const buffer=new ArrayBuffer(44+length*2),v=new DataView(buffer);let off=0;
 const str=s=>{for(let i=0;i<s.length;i++)v.setUint8(off++,s.charCodeAt(i))};
 const u16=x=>{v.setUint16(off,x,true);off+=2},u32=x=>{v.setUint32(off,x,true);off+=4};
 str('RIFF');u32(36+length*2);str('WAVE');str('fmt ');u32(16);u16(1);u16(1);u32(RATE);u32(RATE*2);u16(2);u16(16);str('data');u32(length*2);
 const scale=.87/Math.max(.001,peak);
 for(let i=0;i<length;i++){const val=Math.max(-1,Math.min(1,samples[i]*scale));v.setInt16(off,Math.round(val*(val<0?32768:32767)),true);off+=2;}
 let text='';const bytes=new Uint8Array(buffer);for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));return text;
}
const previous=window.EXTRIBE_makeWav;
if(!Array.isArray(window.EXTRIBE_PACKS)||typeof previous!=='function')throw Error('Load base pack libraries first');
window.EXTRIBE_PACKS.push(...packs);
window.EXTRIBE_makeWav=(id,i)=>{const p=packs.find(x=>x.id===id);return p?makeWave(p,i):previous(id,i)};
window.EXTRIBE_53_PACKS=packs;
})();