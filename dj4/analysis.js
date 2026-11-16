/* DJ DECK PRO 4 – Trackanalyse im Web Worker: Spektral-Wellenform (3 Bänder), BPM + Beatgrid (Downbeat),
   Tonart (Chroma + Krumhansl-Profile), Auto-Gain. Außerdem ID3v2-Tag-Leser. */
'use strict';

const WORKER_SRC = `
function fft(re,im){const n=re.length;for(let i=1,j=0;i<n;i++){let b=n>>1;for(;j&b;b>>=1)j^=b;j^=b;if(i<j){let t=re[i];re[i]=re[j];re[j]=t;t=im[i];im[i]=im[j];im[j]=t;}}
 for(let len=2;len<=n;len<<=1){const a=-2*Math.PI/len,wr=Math.cos(a),wi=Math.sin(a);for(let i=0;i<n;i+=len){let cr=1,ci=0;for(let j=0;j<len/2;j++){const k=i+j,l=k+len/2;
 const tr=re[l]*cr-im[l]*ci,ti=re[l]*ci+im[l]*cr;re[l]=re[k]-tr;im[l]=im[k]-ti;re[k]+=tr;im[k]+=ti;const nr=cr*wr-ci*wi;ci=cr*wi+ci*wr;cr=nr;}}}}
function biq(type,f,sr,q){const w=2*Math.PI*f/sr,c=Math.cos(w),s=Math.sin(w),al=s/(2*q);let b0,b1,b2,a0=1+al,a1=-2*c,a2=1-al;
 if(type==='lp'){b0=(1-c)/2;b1=1-c;b2=(1-c)/2}else{b0=(1+c)/2;b1=-(1+c);b2=(1+c)/2}
 return{b0:b0/a0,b1:b1/a0,b2:b2/a0,a1:a1/a0,a2:a2/a0,x1:0,x2:0,y1:0,y2:0};}
function run(f,x){const y=f.b0*x+f.b1*f.x1+f.b2*f.x2-f.a1*f.y1-f.a2*f.y2;f.x2=f.x1;f.x1=x;f.y2=f.y1;f.y1=y;return y;}
onmessage=e=>{const {id,mono,sr,minBpm}=e.data;try{
 const N=mono.length,BR=150,hop=sr/BR,nb=Math.ceil(N/hop);
 const bins=new Uint8Array(nb*4);
 const lp=biq('lp',220,sr,.707),lp2=biq('lp',220,sr,.707),hp=biq('hp',2600,sr,.707),hp2=biq('hp',2600,sr,.707);
 const OF=200,ohop=sr/OF,no=Math.ceil(N/ohop);const eL=new Float32Array(no),eM=new Float32Array(no),eH=new Float32Array(no);
 let sum2=0,cnt=0,loud=0,loudN=0,peakAll=0;
 const bl=new Float32Array(nb),bm=new Float32Array(nb),bh=new Float32Array(nb),bp=new Float32Array(nb);
 for(let i=0;i<N;i++){const x=mono[i];const l=run(lp2,run(lp,x));const h=run(hp2,run(hp,x));const m=x-l-h;
  const b=(i/hop)|0,o=(i/ohop)|0;const ax=Math.abs(x);if(ax>bp[b])bp[b]=ax;if(ax>peakAll)peakAll=ax;
  bl[b]+=l*l;bm[b]+=m*m;bh[b]+=h*h;eL[o]+=l*l;eM[o]+=m*m;eH[o]+=h*h;sum2+=x*x;cnt++;
  if(cnt>=4410){const r=sum2/cnt;if(r>1e-4){loud+=r;loudN++;}sum2=0;cnt=0;}}
 let mx=1e-9;for(let b=0;b<nb;b++){bl[b]=Math.sqrt(bl[b]/hop);bm[b]=Math.sqrt(bm[b]/hop);bh[b]=Math.sqrt(bh[b]/hop);}
 const pk=Math.max(1e-6,peakAll);
 for(let b=0;b<nb;b++){bins[b*4]=Math.min(255,bp[b]/pk*255);bins[b*4+1]=Math.min(255,bl[b]/pk*2.2*255);bins[b*4+2]=Math.min(255,bm[b]/pk*3*255);bins[b*4+3]=Math.min(255,bh[b]/pk*5*255);}
 // Onset-Kurven (bandweise normiert): on = Tempo, onP = Phase (bassbetont)
 const on=new Float32Array(no),onP=new Float32Array(no);let mL=0,mM=0,mH=0;
 for(let o=0;o<no;o++){mL+=eL[o];mM+=eM[o];mH+=eH[o];}mL=no/(mL||1);mM=no/(mM||1);mH=no/(mH||1);
 let pl=0,pm=0,ph=0;
 for(let o=0;o<no;o++){const l=Math.log1p(4*eL[o]*mL),m=Math.log1p(4*eM[o]*mM),h=Math.log1p(4*eH[o]*mH);
  const dl=Math.max(0,l-pl),dm=Math.max(0,m-pm),dh=Math.max(0,h-ph);on[o]=dl+dm*0.6+dh*0.35;onP[o]=dl+dm*0.25;pl=l;pm=m;ph=h;}
 for(const A of [on,onP]){let mean=0;for(let o=0;o<no;o++)mean+=A[o];mean/=no||1;for(let o=0;o<no;o++)A[o]=Math.max(0,A[o]-mean);}
 // Autokorrelation (grob)
 const lo=Math.floor(OF*60/220),hi=Math.ceil(OF*60/55);const ac=new Float32Array(hi*2+2);
 const step=no>OF*240?2:1;
 for(let l=lo;l<=hi*2&&l<ac.length;l++){let s=0;for(let o=0;o+l<no;o+=step)s+=on[o]*on[o+l];ac[l]=s;}
 let best=0,bestS=-1,raw=0;const mn=minBpm||85;
 for(let l=lo;l<=hi;l++){const bpm=60*OF/l;let s=ac[l]+0.5*(ac[l*2]||0)+0.25*(ac[Math.round(l/2)]||0);
  let fb=bpm;while(fb<mn)fb*=2;while(fb>=mn*2)fb/=2;const w=1+0.25*Math.exp(-Math.pow((bpm-fb)/20,2));s*=w;if(s>bestS){bestS=s;best=fb;raw=bpm;}}
 // Feinabstimmung per Fourier-Magnitude am (ungefalteten) Beat-Takt
 function mag(A,bpm){const w=2*Math.PI*bpm/60/OF;let re=0,im=0;for(let o=0;o<no;o++){const v=A[o];if(v){re+=v*Math.cos(w*o);im-=v*Math.sin(w*o);}}return[re*re+im*im,Math.atan2(im,re)];}
 let bb=raw,bm2=-1;for(let d=-raw*0.012;d<=raw*0.012;d+=raw*0.0004){const m=mag(on,raw+d)[0];if(m>bm2){bm2=m;bb=raw+d;}}
 let fine=bb;for(let d=-0.08;d<=0.08;d+=0.004){const m=mag(on,bb+d)[0];if(m>bm2){bm2=m;fine=bb+d;}}
 while(fine<mn)fine*=2;while(fine>=mn*2)fine/=2;
 let bpm=Math.round(fine*100)/100;if(Math.abs(bpm-Math.round(bpm))<0.04)bpm=Math.round(bpm);
 const T=60/bpm;const phs=-mag(onP,bpm)[1];let off=((phs/(2*Math.PI))*T-0.02)%T;if(off<0)off+=T;
 // Downbeat: Taktphase mit meistem Bass
 let bestB=0,bestE=-1;for(let k=0;k<4;k++){let s=0;for(let t=off+k*T;t<N/sr;t+=4*T){const o=Math.round(t*OF);for(let j=-2;j<=2;j++)s+=eL[o+j]||0;}if(s>bestE){bestE=s;bestB=k;}}
 off=off+bestB*T;while(off-T*4>=0)off-=T*4;
 // Tonart
 const ds=Math.max(1,Math.floor(sr/11025)),fsr=sr/ds,M=Math.floor(N/ds);const F=8192;const re=new Float64Array(F),im=new Float64Array(F),win=new Float64Array(F);
 for(let i=0;i<F;i++)win[i]=0.5-0.5*Math.cos(2*Math.PI*i/F);
 const chroma=new Float64Array(12);const binPc=new Int16Array(F/2).fill(-1);
 for(let k=1;k<F/2;k++){const f=k*fsr/F;if(f<55||f>1800)continue;binPc[k]=((Math.round(12*Math.log2(f/440))+9)%12+12)%12;}
 const fh=F*2;for(let s=0;s+F<M;s+=fh){for(let i=0;i<F;i++){let a=0;const p=(s+i)*ds;for(let j=0;j<ds;j++)a+=mono[p+j];re[i]=a/ds*win[i];im[i]=0;}
  fft(re,im);for(let k=1;k<F/2;k++){const pc=binPc[k];if(pc<0)continue;chroma[pc]+=Math.sqrt(re[k]*re[k]+im[k]*im[k]);}}
 const MAJ=[6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88],MIN=[6.33,2.68,3.52,5.38,2.6,3.53,2.54,4.75,3.98,2.69,3.34,3.17];
 function corr(a,b,r){let ma=0,mb=0;for(let i=0;i<12;i++){ma+=a[(i+r)%12];mb+=b[i];}ma/=12;mb/=12;let n=0,da=0,db=0;for(let i=0;i<12;i++){const x=a[(i+r)%12]-ma,y=b[i]-mb;n+=x*y;da+=x*x;db+=y*y;}return n/Math.sqrt(da*db||1);}
 let key=null,kb=-2;for(let t=0;t<12;t++){const c1=corr(chroma,MAJ,t),c2=corr(chroma,MIN,t);if(c1>kb){kb=c1;key={t,m:0}}if(c2>kb){kb=c2;key={t,m:1}}}
 const rms=loudN?Math.sqrt(loud/loudN):0.1;let gain=-11-20*Math.log10(rms||1e-3);gain=Math.max(-12,Math.min(12,gain));
 postMessage({id,ok:true,bins,binRate:BR,bpm,offset:off,key,gain,duration:N/sr},[bins.buffer]);
}catch(err){postMessage({id,ok:false,err:String(err)})}};
`;

const Analyzer = {
  w: null, q: new Map(), seq: 0,
  worker() {
    if (!this.w) {
      this.w = new Worker(URL.createObjectURL(new Blob([WORKER_SRC], { type: 'application/javascript' })));
      this.w.onmessage = e => { const r = this.q.get(e.data.id); if (r) { this.q.delete(e.data.id); e.data.ok ? r.res(e.data) : r.rej(new Error(e.data.err)); } };
    }
    return this.w;
  },
  run(mono, sr, minBpm) {
    const id = ++this.seq;
    return new Promise((res, rej) => { this.q.set(id, { res, rej }); this.worker().postMessage({ id, mono, sr, minBpm }, [mono.buffer]); });
  },
};

const KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
function camelot(t, m) { // t 0..11, m 0 Dur/1 Moll
  const base = m ? (t + 3) % 12 : t; const num = ((base * 7) % 12 + 7) % 12 + 1; return num + (m ? 'A' : 'B');
}
function keyName(k, shift = 0, mode = 'camelot') {
  if (!k) return '–';
  const t = ((k.t + Math.round(shift)) % 12 + 12) % 12;
  if (mode === 'musical') return KEYS[t] + (k.m ? 'm' : '');
  if (mode === 'open') { const c = camelot(t, k.m); const n = parseInt(c); return (((n + 4) % 12) + 1) + (k.m ? 'm' : 'd'); }
  return camelot(t, k.m);
}
function keyCompatible(a, b) { // Camelot-Nachbarn
  if (!a || !b) return false;
  const ca = camelot(a.t, a.m), cb = camelot(b.t, b.m);
  const na = parseInt(ca), nb = parseInt(cb), la = ca.slice(-1), lb = cb.slice(-1);
  if (ca === cb) return true;
  if (la === lb && (Math.abs(na - nb) === 1 || Math.abs(na - nb) === 11)) return true;
  return na === nb;
}

/* ID3v2 (2.2/2.3/2.4) Text-Frames lesen */
async function readTags(file) {
  const out = {};
  try {
    const head = new Uint8Array(await file.slice(0, 10).arrayBuffer());
    if (head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33) {
      const ver = head[3];
      const size = (head[6] & 127) << 21 | (head[7] & 127) << 14 | (head[8] & 127) << 7 | (head[9] & 127);
      const buf = new Uint8Array(await file.slice(10, 10 + Math.min(size, 512 * 1024)).arrayBuffer());
      let p = 0; const idl = ver === 2 ? 3 : 4, hl = ver === 2 ? 6 : 10;
      const map = { TIT2: 'title', TT2: 'title', TPE1: 'artist', TP1: 'artist', TALB: 'album', TAL: 'album', TBPM: 'bpm', TBP: 'bpm', TKEY: 'key', TKE: 'key', TCON: 'genre', TCO: 'genre' };
      while (p + hl < buf.length) {
        const id = String.fromCharCode(...buf.slice(p, p + idl));
        if (!/^[A-Z0-9]+$/.test(id)) break;
        let fs;
        if (ver === 2) fs = buf[p + 3] << 16 | buf[p + 4] << 8 | buf[p + 5];
        else if (ver === 4) fs = (buf[p + 4] & 127) << 21 | (buf[p + 5] & 127) << 14 | (buf[p + 6] & 127) << 7 | (buf[p + 7] & 127);
        else fs = buf[p + 4] << 24 | buf[p + 5] << 16 | buf[p + 6] << 8 | buf[p + 7];
        if (fs <= 0 || p + hl + fs > buf.length) break;
        if (map[id]) {
          const d = buf.slice(p + hl, p + hl + fs); const enc = d[0]; let txt = '';
          try {
            if (enc === 0) txt = new TextDecoder('latin1').decode(d.slice(1));
            else if (enc === 1) txt = new TextDecoder('utf-16').decode(d.slice(1));
            else if (enc === 2) txt = new TextDecoder('utf-16be').decode(d.slice(1));
            else txt = new TextDecoder('utf-8').decode(d.slice(1));
          } catch (e) {}
          txt = txt.replace(/\u0000+$/g, '').replace(/\u0000/g, ' / ').trim();
          if (txt) out[map[id]] = txt;
        }
        p += hl + fs;
      }
    }
  } catch (e) {}
  if (!out.title) {
    const base = file.name.replace(/\.[^.]+$/, '').replace(/_/g, ' ');
    const m = base.split(/\s+-\s+/);
    if (m.length >= 2 && !out.artist) { out.artist = m[0].trim(); out.title = m.slice(1).join(' - ').trim(); }
    else out.title = base;
  }
  return out;
}

window.Analysis = { Analyzer, keyName, keyCompatible, readTags, camelot, KEYS };
