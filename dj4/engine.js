/* DJ DECK PRO 4 – Audio-Engine
   Deck-Player als AudioWorklet (variable Geschwindigkeit, Scratch, Reverse, Loops, Slip/Flux,
   Keylock + Tonart-Shift per granularem Pitch-Shifter), Mixer, Cue-Bus, Limiter, Recorder. */
'use strict';

const WORKLET_SRC = `
const TAU=Math.PI*2;
class DeckProc extends AudioWorkletProcessor{
 constructor(){super();
  this.L=null;this.R=null;this.len=0;this.bsr=44100;this.k=1;this.pos=0;this.playing=false;
  this.rate=1;this.bend=0;this.adj=0;this.speed=0;this.dir=1;this.scr=false;this.scrVel=0;this.scrSm=0;
  this.loopOn=false;this.la=0;this.lb=0;this.slip=false;this.shadow=0;this.keylock=false;this.semis=0;
  this.brake=0;this.startT=0;this.N=16384;this.M=16383;this.bL=new Float32Array(16384);this.bR=new Float32Array(16384);
  this.w=0;this.ph=0;this.W=Math.round(sampleRate*0.05);this.mix=0;this.cnt=0;this.ended=false;this.xf=0;this.xfL=0;this.xfR=0;
  this.port.onmessage=e=>this.msg(e.data);}
 msg(m){switch(m.t){
  case'load':this.L=m.L;this.R=m.R||m.L;this.len=m.L.length;this.bsr=m.sr;this.k=m.sr/sampleRate;this.pos=0;this.shadow=0;
   this.playing=false;this.speed=0;this.loopOn=false;this.ended=false;this.dir=1;break;
  case'unload':this.L=this.R=null;this.len=0;this.playing=false;this.speed=0;break;
  case'play':this.playing=!!m.v;if(m.v){this.ended=false;if(this.slip)this.shadow=this.pos}break;
  case'seek':this.fade();this.pos=Math.max(0,m.pos*this.bsr);if(this.slip&&!m.keep)this.shadow=this.pos;this.ended=false;break;
  case'jump':this.fade();this.pos=Math.max(0,this.pos+m.d*this.bsr);if(this.slip)this.shadow+=m.d*this.bsr;break;
  case'rate':this.rate=m.v;break;
  case'bend':this.bend=m.v;break;
  case'adj':this.adj=m.v;break;
  case'scr':this.scr=!!m.on;if(m.on){this.scrSm=this.speed;this.scrVel=0}break;
  case'vel':this.scrVel=m.v;break;
  case'loop':this.loopOn=!!m.on;this.la=m.a*this.bsr;this.lb=m.b*this.bsr;
   if(m.on&&this.pos>this.lb){this.fade();this.pos=this.la+((this.pos-this.la)%(this.lb-this.la))}break;
  case'slip':this.slip=!!m.on;this.shadow=this.pos;break;
  case'slipret':if(this.slip){this.fade();this.pos=this.shadow}break;
  case'rev':this.dir=m.on?-1:1;break;
  case'keylock':this.keylock=!!m.on;break;
  case'semis':this.semis=m.v;break;
  case'ramp':this.brake=m.brake||0;this.startT=m.start||0;break;
 }}
 fade(){this.xf=64;}
 rd(B,p){const i=p|0,f=p-i;const a=B[i-1]||0,b=B[i]||0,c=B[i+1]||0,d=B[i+2]||0;
  const c1=.5*(c-a),c2=a-2.5*b+2*c-.5*d,c3=.5*(d-a)+1.5*(b-c);return((c3*f+c2)*f+c1)*f+b;}
 process(_,outs){
  const o=outs[0],oL=o[0],oR=o[1]||o[0],n=oL.length;
  if(!this.L){oL.fill(0);if(oR!==oL)oR.fill(0);this.post();return true;}
  const tgt=this.playing?(this.rate+this.bend+this.adj)*this.dir:0;
  const up=this.startT>0?1/(this.startT*sampleRate):1e9, dn=this.brake>0?1/(this.brake*sampleRate):1e9;
  const sp0=Math.abs(this.scr?this.scrSm:tgt);
  let ratio=Math.pow(2,this.semis/12);
  if(this.keylock&&!this.scr&&sp0>0.05)ratio/=sp0;
  ratio=Math.min(4,Math.max(.25,ratio));
  const mt=(Math.abs(ratio-1)>1e-4)?1:0;const W=this.W,M=this.M,bL=this.bL,bR=this.bR,L=this.L,R=this.R,len=this.len;
  for(let i=0;i<n;i++){
   let sp;
   if(this.scr){this.scrSm+=(this.scrVel-this.scrSm)*0.003;sp=this.scrSm;this.speed=sp;}
   else{const d=tgt-this.speed;if(d>0)this.speed+=Math.min(d,up);else if(d<0)this.speed+=Math.max(d,-(this.playing?up:dn));sp=this.speed;}
   const p=this.pos;let l=0,r=0;
   if(p>=1&&p<len-3){l=this.rd(L,p);r=this.rd(R,p);}
   if(this.xf>0){const g=1-this.xf/64;l*=g;r*=g;this.xf--;}
   this.pos+=sp*this.k;
   if(this.slip&&this.playing)this.shadow+=this.rate*this.k;
   if(this.loopOn&&this.lb>this.la){const ll=this.lb-this.la;if(sp>=0&&this.pos>=this.lb)this.pos-=ll;else if(sp<0&&this.pos<this.la)this.pos+=ll;}
   if(this.pos>=len-3){this.pos=len-3;if(!this.scr){this.playing=false;this.speed=0;this.ended=true;}}
   if(this.pos<0)this.pos=0;
   this.mix+=(mt-this.mix)*0.0015;
   if(this.mix>1e-4){
    const w=this.w=(this.w+1)&M;bL[w]=l;bR[w]=r;
    let ph=this.ph+(1-ratio)/W;ph-=Math.floor(ph);this.ph=ph;
    let ph2=ph+.5;if(ph2>=1)ph2-=1;
    const g1=Math.sin(Math.PI*ph)**2,g2=1-g1;
    const r1=w-ph*W,r2=w-ph2*W;
    const i1=Math.floor(r1),f1=r1-i1,i2=Math.floor(r2),f2=r2-i2;
    const sl=(bL[i1&M]*(1-f1)+bL[(i1+1)&M]*f1)*g1+(bL[i2&M]*(1-f2)+bL[(i2+1)&M]*f2)*g2;
    const sr=(bR[i1&M]*(1-f1)+bR[(i1+1)&M]*f1)*g1+(bR[i2&M]*(1-f2)+bR[(i2+1)&M]*f2)*g2;
    const m=this.mix;l=l*(1-m)+sl*m;r=r*(1-m)+sr*m;
   }else{const w=this.w=(this.w+1)&M;bL[w]=l;bR[w]=r;}
   oL[i]=l;if(oR!==oL)oR[i]=r;
  }
  this.post();return true;}
 post(){if(++this.cnt<3)return;this.cnt=0;
  this.port.postMessage({t:'pos',pos:this.pos/this.bsr,sp:this.speed,ct:currentTime,pl:this.playing,sh:this.shadow/this.bsr,end:this.ended});
  this.ended=false;}
}
registerProcessor('deck-proc',DeckProc);

class CrushProc extends AudioWorkletProcessor{
 static get parameterDescriptors(){return[{name:'bits',defaultValue:16,minValue:1,maxValue:16},{name:'down',defaultValue:1,minValue:1,maxValue:64}]}
 constructor(){super();this.h=[0,0];this.c=0;}
 process(ins,outs,p){const I=ins[0],O=outs[0];if(!I||!I.length){return true}
  const bits=p.bits[0],dn=Math.max(1,Math.round(p.down[0])),q=Math.pow(2,bits-1);
  for(let ch=0;ch<O.length;ch++){const a=I[ch]||I[0],b=O[ch];let c=this.c;let h=this.h[ch]||0;
   for(let i=0;i<b.length;i++){if(c%dn===0)h=Math.round(a[i]*q)/q;b[i]=h;c++;}
   this.h[ch]=h;if(ch===O.length-1)this.c=c%6400;}
  return true;}
}
registerProcessor('crush-proc',CrushProc);

class RecProc extends AudioWorkletProcessor{
 constructor(){super();this.on=false;this.bl=[];this.br=[];this.n=0;this.port.onmessage=e=>{this.on=!!e.data.on;if(!this.on)this.flush();};}
 flush(){if(!this.n)return;const L=new Float32Array(this.n),R=new Float32Array(this.n);let o=0;
  for(let i=0;i<this.bl.length;i++){L.set(this.bl[i],o);R.set(this.br[i],o);o+=this.bl[i].length;}
  this.port.postMessage({L,R},[L.buffer,R.buffer]);this.bl=[];this.br=[];this.n=0;}
 process(ins,outs){const I=ins[0];if(this.on&&I&&I.length){this.bl.push(I[0].slice());this.br.push((I[1]||I[0]).slice());this.n+=I[0].length;if(this.n>=16384)this.flush();}
  return true;}
}
registerProcessor('rec-proc',RecProc);
`;

const Engine = {
  ctx: null, ready: false, decks: [], cueBus: null, master: null,
  async init() {
    if (this.ready) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC({ latencyHint: 'interactive' });
    const url = URL.createObjectURL(new Blob([WORKLET_SRC], { type: 'application/javascript' }));
    await this.ctx.audioWorklet.addModule(url);
    const c = this.ctx;
    // Master bus
    this.masterBus = c.createGain();
    this.masterVol = c.createGain();
    this.limiter = c.createDynamicsCompressor();
    this.limiter.threshold.value = -1.5; this.limiter.knee.value = 0; this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.002; this.limiter.release.value = 0.12;
    this.masterOut = c.createGain();
    this.masterBus.connect(this.masterVol).connect(this.limiter).connect(this.masterOut);
    this.masterMeterL = c.createAnalyser(); this.masterMeterR = c.createAnalyser();
    this.masterMeterL.fftSize = this.masterMeterR.fftSize = 512;
    const spl = c.createChannelSplitter(2); this.masterOut.connect(spl);
    spl.connect(this.masterMeterL, 0); spl.connect(this.masterMeterR, 1);
    // Cue bus
    this.cueBus = c.createGain();
    this.cueMixCue = c.createGain(); this.cueMixMaster = c.createGain(); this.cueVol = c.createGain();
    this.cueBus.connect(this.cueMixCue).connect(this.cueVol);
    this.masterOut.connect(this.cueMixMaster).connect(this.cueVol);
    this.setCueMix(0.5);
    // Recorder tap
    this.recNode = new AudioWorkletNode(c, 'rec-proc', { numberOfInputs: 1, numberOfOutputs: 0, channelCount: 2, channelCountMode: 'explicit' });
    this.masterOut.connect(this.recNode);
    this.recStream = c.createMediaStreamDestination ? c.createMediaStreamDestination() : null;
    if (this.recStream) this.masterOut.connect(this.recStream);
    for (let i = 0; i < 4; i++) this.decks.push(new Channel(this, i));
    this.routing = 'stereo';
    this.applyRouting('stereo');
    this.ready = true;
  },
  setCueMix(v) { // 0 = nur Cue, 1 = nur Master
    if (!this.cueMixCue) return;
    this.cueMixCue.gain.value = Math.cos(v * Math.PI / 2);
    this.cueMixMaster.gain.value = Math.sin(v * Math.PI / 2);
  },
  maxChannels() { return this.ctx ? this.ctx.destination.maxChannelCount : 2; },
  applyRouting(mode) {
    const c = this.ctx; if (!c) return;
    this.routing = mode;
    try { this.masterOut.disconnect(c.destination); } catch (e) {}
    try { this.cueVol.disconnect(); } catch (e) {}
    if (this.routeMerger) { try { this.routeMerger.disconnect(); } catch (e) {} this.routeMerger = null; }
    if (this.cueEl) { this.cueEl.pause(); this.cueEl.srcObject = null; }
    const dest = c.destination;
    if (mode === 'split') {
      // L = Cue (mono), R = Master (mono) – Splitkabel/Y-Kabel
      dest.channelCount = 2; dest.channelInterpretation = 'discrete';
      const m = c.createChannelMerger(2);
      const mc = c.createGain(); mc.channelCount = 1; mc.channelCountMode = 'explicit'; mc.channelInterpretation = 'speakers';
      const mm = c.createGain(); mm.channelCount = 1; mm.channelCountMode = 'explicit'; mm.channelInterpretation = 'speakers';
      this.cueVol.connect(mc).connect(m, 0, 0);
      this.masterOut.connect(mm).connect(m, 0, 1);
      m.connect(dest); this.routeMerger = m;
    } else if (mode === 'quad' && dest.maxChannelCount >= 4) {
      dest.channelCount = 4; dest.channelInterpretation = 'discrete';
      const m = c.createChannelMerger(4);
      const s1 = c.createChannelSplitter(2), s2 = c.createChannelSplitter(2);
      this.masterOut.connect(s1); this.cueVol.connect(s2);
      s1.connect(m, 0, 0); s1.connect(m, 1, 1); s2.connect(m, 0, 2); s2.connect(m, 1, 3);
      m.connect(dest); this.routeMerger = m;
    } else if (mode === 'device') {
      dest.channelCount = 2; dest.channelInterpretation = 'speakers';
      this.masterOut.connect(dest);
      if (!this.cueStream) this.cueStream = c.createMediaStreamDestination();
      this.cueVol.connect(this.cueStream);
      if (!this.cueEl) { this.cueEl = new Audio(); this.cueEl.autoplay = true; }
      this.cueEl.srcObject = this.cueStream.stream;
      if (this.cueSink && this.cueEl.setSinkId) this.cueEl.setSinkId(this.cueSink).catch(() => {});
      this.cueEl.play().catch(() => {});
    } else {
      dest.channelCount = 2; dest.channelInterpretation = 'speakers';
      this.masterOut.connect(dest);
    }
  },
  async setMasterSink(id) { if (this.ctx && this.ctx.setSinkId) await this.ctx.setSinkId(id || ''); },
  async setCueSink(id) { this.cueSink = id; if (this.cueEl && this.cueEl.setSinkId) await this.cueEl.setSinkId(id || ''); },
  latency() { const c = this.ctx; if (!c) return 0; return (c.outputLatency || 0) + (c.baseLatency || 0); },
};

/* Kanalzug: Player -> Trim -> EQ(3) -> Filter -> FX-Inserts -> (Cue) -> Fader -> Crossfader -> Master */
class Channel {
  constructor(eng, idx) {
    const c = eng.ctx; this.eng = eng; this.idx = idx;
    this.player = new AudioWorkletNode(c, 'deck-proc', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
    this.trim = c.createGain();
    this.lo = c.createBiquadFilter(); this.lo.type = 'lowshelf'; this.lo.frequency.value = 180;
    this.mid = c.createBiquadFilter(); this.mid.type = 'peaking'; this.mid.frequency.value = 1100; this.mid.Q.value = 0.6;
    this.hi = c.createBiquadFilter(); this.hi.type = 'highshelf'; this.hi.frequency.value = 3200;
    this.hp = c.createBiquadFilter(); this.hp.type = 'highpass'; this.hp.frequency.value = 10; this.hp.Q.value = 0.7;
    this.lp = c.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 22000; this.lp.Q.value = 0.7;
    this.fxIn = c.createGain(); this.fxOut = c.createGain();
    this.cue = c.createGain(); this.cue.gain.value = 0;
    this.fader = c.createGain(); this.xf = c.createGain();
    this.meterL = c.createAnalyser(); this.meterR = c.createAnalyser(); this.meterL.fftSize = this.meterR.fftSize = 256;
    this.player.connect(this.trim).connect(this.lo).connect(this.mid).connect(this.hi).connect(this.hp).connect(this.lp).connect(this.fxIn);
    this.fxIn.connect(this.fxOut);
    this.fxOut.connect(this.cue).connect(eng.cueBus);
    this.fxOut.connect(this.fader).connect(this.xf).connect(eng.masterBus);
    const s = c.createChannelSplitter(2); this.fxOut.connect(s); s.connect(this.meterL, 0); s.connect(this.meterR, 1);
    this.fx = []; // FX-Instanzen in Reihenfolge
    this.port = this.player.port;
  }
  send(m, tr) { this.port.postMessage(m, tr || []); }
  setEQ(band, db) { // db: -inf..+12 ; Kill = -40
    const f = band === 'lo' ? this.lo : band === 'mid' ? this.mid : this.hi;
    f.gain.setTargetAtTime(Math.max(-40, db), this.eng.ctx.currentTime, 0.01);
  }
  setFilter(v) { // -1..1 ; <0 Tiefpass, >0 Hochpass
    const t = this.eng.ctx.currentTime;
    const dz = 0.03;
    if (v < -dz) { const x = (-v - dz) / (1 - dz); this.lp.frequency.setTargetAtTime(22000 * Math.pow(60 / 22000, x), t, 0.015); this.hp.frequency.setTargetAtTime(10, t, 0.015); }
    else if (v > dz) { const x = (v - dz) / (1 - dz); this.hp.frequency.setTargetAtTime(10 * Math.pow(9000 / 10, x), t, 0.015); this.lp.frequency.setTargetAtTime(22000, t, 0.015); }
    else { this.lp.frequency.setTargetAtTime(22000, t, 0.015); this.hp.frequency.setTargetAtTime(10, t, 0.015); }
  }
  setFilterRes(q) { this.lp.Q.value = q; this.hp.Q.value = q; }
  setFxChain(list) {
    try { this.fxIn.disconnect(); } catch (e) {}
    this.fx.forEach(f => { try { f.output.disconnect(); } catch (e) {} });
    let node = this.fxIn;
    list.forEach(f => { node.connect(f.input); node = f.output; });
    node.connect(this.fxOut);
    this.fx = list;
  }
}
window.Engine = Engine;
