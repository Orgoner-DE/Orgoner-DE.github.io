/* EX-TRIBE PRO 5.2: 8 additional original, deterministic PCM synthesizer packs. No artist audio. */
(()=>{'use strict';
const extra=[
 {id:'warehouse44',name:'WAREHOUSE 44 · BERLIN RAW',subtitle:'Unoffiziell: rauer Berlin-Hardtechno, Distortion und düstere Industrieflächen',bpm:153,ref:['44 LABEL GROUP (Stil-Referenz)','Kobosil','Somewhen','In Verruf','Ueberrest'],tone:48,drive:3.6,noise:.30,decay:1.0,seed:44},
 {id:'clubsound',name:'CLUB SUB XL · SOUND SYSTEM',subtitle:'Satter Club-Tiefbass, klare Transienten, Vinyl-Rumble und großer Sub',bpm:132,ref:['Club-Sound','Subbass','Peak-Time'],tone:44,drive:1.45,noise:.10,decay:1.3,seed:127},
 {id:'schranzpro',name:'SCHRANZ MACHINE · INDUSTRIAL',subtitle:'Hart, trocken und repetitiv: Maschinen-Grooves und metallische Drums',bpm:151,ref:['Chris Liebing','DJ Rush','Felix Kröcher','Robert Natus'],tone:51,drive:3.3,noise:.29,decay:.8,seed:181},
 {id:'tribaldrive',name:'TRIBAL PRESSURE · RUSH DRIVE',subtitle:'Polyrhythmische Toms, sägende Drums und rollender Perkussionsdruck',bpm:146,ref:['DJ Rush (Stil-Orientierung)','Percussion Techno'],tone:52,drive:2.4,noise:.18,decay:.92,seed:217},
 {id:'trap808',name:'TRAP 808 · STREET BASS',subtitle:'Lange 808-Kicks, Snare, Hi-Hat-Rolls, dunkle Keys und Grit',bpm:142,ref:['Trap','808 Bass','Half-Time'],tone:42,drive:1.9,noise:.12,decay:2.2,seed:301},
 {id:'hardgabba',name:'HARD GABBA · DISTORTION',subtitle:'Übersteuerte Gabber-Kicks, schnelle Rave-Stabs und Abriss-Impacts',bpm:185,ref:['Gabber','Hardcore','Rave'],tone:55,drive:6.3,noise:.43,decay:.72,seed:390},
 {id:'industrialx',name:'INDUSTRIAL RAVE · STEEL',subtitle:'Maschinenschläge, Filter-Sirenen, Rumble-Kicks, Metall und Krach',bpm:162,ref:['Industrial Techno','Dark Warehouse'],tone:49,drive:4.0,noise:.48,decay:.83,seed:471},
 {id:'easttekkplus',name:'OSTTEKK XTRA · EAST FLOOR',subtitle:'Ostdeutscher Tekk: springende Kicks, knackige Drops und schräge FX',bpm:176,ref:['Hardtekk','Ostdeutscher Underground','Fabi Tech / Cyprix (Orientierung)'],tone:54,drive:3.0,noise:.24,decay:.9,seed:555}
];
const labels=['KICK MAIN','KICK PUNCH','KICK DIST','KICK RUMBLE','SUB LONG','BASS SLIDE','BASS STAB','808 LOW','CLAP WIDE','SNARE CRACK','HAT TIGHT','HAT OPEN','RIDE / SHAKER','TOM / METAL','RAVE STAB','RISING IMPACT'];
for(const p of extra){p.samples=labels.map((name,i)=>({name,file:`packs/${p.id}/${String(i+1).padStart(2,'0')}-${name.toLowerCase().replace(/[^a-z0-9]+/g,'-')}.wav`}));}
const rate=44100;
function makeWave(p,index){
 let seed=(20261025+p.seed*1237+index*911)>>>0;
 const rand=()=>{seed^=(seed<<13);seed^=(seed>>>17);seed^=(seed<<5);return ((seed>>>0)/2147483648)-1;};
 const dur=[.46,.35,.31,.68,.92,.7,.44,1.15,.26,.23,.11,.33,.39,.38,.53,.98][index]*(index>=4&&index<=7?p.decay:1);
 const len=Math.max(256,Math.round(dur*rate)), data=new Float32Array(len);
 let phase=0,lastNoise=0,peak=0,envSum=0,lp=0;
 const hz=p.tone,drive=p.drive,attack=1/(rate*.002);
 for(let i=0;i<len;i++){
 const t=i/rate,q=i/len,r=rand(),fast=rand(),base=(index===7?hz*.68:hz)+(index===1?8:0);
 let v=0;
 if(index<=3){
  const pitch=base+(index===2?290:175)*Math.exp(-t*(index===3?19:39));phase+=2*Math.PI*pitch/rate;
  const tail=Math.exp(-t*(index===3?6.5:index===2?12:9)*p.decay**-.35);
  let sub=Math.sin(phase)+.14*Math.sin(phase*2);
  if(index===2||index===3)sub=Math.tanh(sub*drive);
  v=tail*sub + r*.10*Math.exp(-t*85);
  if(index===3){lp=lp*.99+r*.01;v+=(lp*.45+Math.sin(phase*.99)*.30)*Math.exp(-t*5)}
 } else if(index<=7){
  let freq=base*(index===7?1: index===5?1.2:1.5);
  freq*=1+.19*Math.exp(-t*13)+(index===5?.1*Math.sin(2*Math.PI*5*t):0);
  phase+=2*Math.PI*freq/rate;
  let wave=Math.sin(phase) + (index===6?.33*Math.sin(phase*2):0);
  if(index===5||index===6)wave=Math.tanh(wave*drive*.7);
  v=wave*Math.exp(-t*(index===7?2.9:index===4?3.1:index===6?10:5));
 } else if(index===8||index===9){
  v=((r*.7)+(fast-lastNoise)*.20)*Math.exp(-t*(index===8?26:20));
  const tone=(index===8?190:225);v+=Math.sin(2*Math.PI*tone*t)*.23*Math.exp(-t*42);
  if(index===8&&t>.018&&t<.07)v+=r*.28*Math.exp(-(t-.018)*30);
 }else if(index<=12){
  let n=r-lastNoise;lp=lp*.93 + r*.07;
  v=(index===12?(n*.47+lp*.62):n*.8)*Math.exp(-t*(index===10?62:index===11?18:14));
  if(index===12)v+=.12*Math.sin(2*Math.PI*5200*t)*Math.exp(-t*8);
 }else if(index===13){
  phase+=2*Math.PI*(index===13?112:198)/rate;
  v=(Math.sin(phase)+.48*Math.sin(phase*1.73)+.27*Math.sin(phase*3.04)+r*.35)*Math.exp(-t*13);
 }else if(index===14){
  phase+=2*Math.PI*(hz*2.5 + 70*Math.exp(-t*16))/rate;
  v=(Math.sin(phase)+.25*Math.sin(phase*2.01)+.24*Math.sin(phase*2.98))*Math.exp(-t*8);
  v=Math.tanh(v*drive*.82);
 }else{
  phase+=2*Math.PI*(300+400*t+35*Math.sin(t*100))/rate;
  const sweep=Math.sin(phase*.85)*(q*.8+.1);
  v=(sweep+.23*r+.13*Math.sin(2*Math.PI*41*t))*(1-q)**1.15;
 }
 if(p.id==='trap808'&&index<=7)v=Math.tanh(v*(index===7?1.45:1.15))*1.06;
 else if(p.id==='hardgabba'&&(index<=3||index===14))v=Math.tanh(v*5.3)+.11*Math.sin(phase*2.03)*Math.exp(-t*10);
 else if(p.id==='tribaldrive'&&index>=8&&index<=14)v+=(Math.sin(2*Math.PI*(140+index*13)*t)*.19)*Math.exp(-t*18);
 else if(p.id==='industrialx'&&index>=8)v=Math.tanh((v+.11*fast*Math.exp(-t*4))*2.3);
 const fadeIn=Math.min(1,i*attack), fadeOut=Math.min(1,(len-i-1)/(rate*.009));
 v*=Math.max(0,Math.min(fadeIn,fadeOut));
 if(!Number.isFinite(v))v=0;data[i]=v;peak=Math.max(peak,Math.abs(v));lastNoise=r;
 }
 const buf=new ArrayBuffer(44+len*2),dv=new DataView(buf), scale=.88/Math.max(.001,peak);let o=0;
 function chars(s){for(let k=0;k<s.length;k++)dv.setUint8(o++,s.charCodeAt(k));}function u16(n){dv.setUint16(o,n,true);o+=2;}function u32(n){dv.setUint32(o,n,true);o+=4;}
 chars('RIFF');u32(36+len*2);chars('WAVE');chars('fmt ');u32(16);u16(1);u16(1);u32(rate);u32(rate*2);u16(2);u16(16);chars('data');u32(len*2);
 for(let k=0;k<len;k++){const f=Math.max(-1,Math.min(1,data[k]*scale));dv.setInt16(o,Math.round(f*(f<0?32768:32767)),true);o+=2;}
 // Binary string is used by the existing sample-bank loader and B64 encoder.
 let text='';const array=new Uint8Array(buf);for(let k=0;k<array.length;k+=8192)text+=String.fromCharCode(...array.subarray(k,k+8192));return text;
}
const prior=window.EXTRIBE_makeWav;window.EXTRIBE_PACKS.push(...extra);
window.EXTRIBE_makeWav=(id,index)=>{const p=extra.find(p=>p.id===id);return p?makeWave(p,index):prior(id,index);};
window.EXTRIBE_EXTRA_PACKS=extra;
})();
