/* EX-TRIBE PRO 5.3: native WebAudio real-time and offline FX. FX OFF at startup. */
(()=>{'use strict';
const MODES=[
 ['dry','DRY / OHNE FX'],['punch','KICK · PUNCH / SAT'],['rumble','KICK · RUMBLE / DUCK'],
 ['grit','SCHRANZ · GRIT / HP'],['space','PERC · SPACE / REVERB'],
 ['trap','TRAP · SUB / ECHO'],['gabba','GABBA · HARD CLIP']
];
const PRESETS=[
 ['dry','BYPASS · OHNE EFFEKTE'],['club','CLUB · KICK + RUMBLE'],
 ['schranz','SCHRANZ · IRON DRIVE'],['trap','TRAP · 808 / SPACE'],
 ['gabba','HARD GABBA · CRUSH'],['industrial','WAREHOUSE · METALL']
];
const maps={
 dry:()=> 'dry',
 club:i=>i<3?'punch':i<8?'rumble':i<13?'space':'grit',
 schranz:i=>i<4?'grit':i<8?'punch':i<13?'grit':'space',
 trap:i=>i<4?'punch':i<8?'trap':i<13?'space':'grit',
 gabba:i=>i<8?'gabba':i<14?'grit':'gabba',
 industrial:i=>i<4?'punch':i<8?'grit':i<14?'space':'gabba'
};
const masterDrives={dry:0,club:17,schranz:39,trap:11,gabba:52,industrial:33};
const defaults={dry:{filter:18000,delay:0},club:{filter:15400,delay:8},schranz:{filter:12800,delay:6},trap:{filter:17500,delay:13},gabba:{filter:15000,delay:4},industrial:{filter:10800,delay:12}};
function makeCurve(drive=1,hard=false){const curve=new Float32Array(1024);const gain=Math.max(1,Math.min(8,Number(drive)||1));const norm=Math.tanh(gain)||1;for(let i=0;i<curve.length;i++){const x=i*2/(curve.length-1)-1;curve[i]=hard?Math.max(-.82,Math.min(.82,x*gain))/.82:Math.tanh(x*gain)/norm}return curve;}
const reverbBuffers=new WeakMap();
function impulse(ctx){let b=reverbBuffers.get(ctx);if(b)return b;const rate=ctx.sampleRate,length=Math.round(rate*.23);b=ctx.createBuffer(2,length,rate);let s=0xafe093;for(let ch=0;ch<2;ch++){const d=b.getChannelData(ch);for(let i=0;i<length;i++){s^=s<<13;s^=s>>>17;s^=s<<5;d[i]=((s>>>0)/2147483648-1)*Math.exp(-i/length*8)}}reverbBuffers.set(ctx,b);return b;}
function connectTrack(ctx,input,output,mode,at,duration){
 if(!MODES.some(x=>x[0]===mode)||mode==='dry'){input.connect(output);return null;}
 const nodes=[];const add=n=>(nodes.push(n),n);const bi=(type,freq,q=0.7)=>{const n=add(ctx.createBiquadFilter());n.type=type;n.frequency.value=freq;n.Q.value=q;return n};
 const sh=(drive,hard=false)=>{const n=add(ctx.createWaveShaper());n.curve=makeCurve(drive,hard);n.oversample='2x';return n};
 const g=val=>{const n=add(ctx.createGain());n.gain.value=val;return n};
 const delay=val=>{const n=add(ctx.createDelay(1));n.delayTime.value=val;return n};
 let tail=.08;
 switch(mode){
  case 'punch':{const hp=bi('highpass',30),sat=sh(2.1),lp=bi('lowpass',14500);input.connect(hp);hp.connect(sat);sat.connect(lp);lp.connect(output);break;}
  case 'rumble':{const dry=g(.91);input.connect(dry);dry.connect(output);const d=delay(.065),lp=bi('lowpass',155),sat=sh(1.7),wet=g(.24);input.connect(d);d.connect(lp);lp.connect(sat);sat.connect(wet);wet.connect(output);if(Number.isFinite(at)){wet.gain.setValueAtTime(.05,at);wet.gain.linearRampToValueAtTime(.24,at+.13);}tail=.12;break;}
  case 'grit':{const hp=bi('highpass',140),sat=sh(3.6),lp=bi('lowpass',12300);input.connect(hp);hp.connect(sat);sat.connect(lp);lp.connect(output);break;}
  case 'space':{const dry=g(.87),re=add(ctx.createConvolver()),wet=g(.23),hp=bi('highpass',380);re.buffer=impulse(ctx);input.connect(dry);dry.connect(output);input.connect(hp);hp.connect(re);re.connect(wet);wet.connect(output);tail=.35;break;}
  case 'trap':{const hp=bi('highpass',27),sat=sh(1.4),lp=bi('lowpass',10800),d=delay(.19),wet=g(.12);input.connect(hp);hp.connect(sat);sat.connect(lp);lp.connect(output);lp.connect(d);d.connect(wet);wet.connect(output);tail=.23;break;}
  case 'gabba':{const hp=bi('highpass',31),clip=sh(4.6,true),lp=bi('lowpass',13000);input.connect(hp);hp.connect(clip);clip.connect(lp);lp.connect(output);break;}
 }
 return {tail, release(){try{input.disconnect()}catch{}for(const n of nodes){try{n.disconnect()}catch{}}}};
}
function presetMap(name,index){return (maps[name]||maps.dry)(index)}
window.EXTRIBE_FX53={MODES,PRESETS,masterDrives,defaults,presetMap,makeCurve,connectTrack};
})();