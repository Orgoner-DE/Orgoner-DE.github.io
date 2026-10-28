import * as THREE from '../vendor/three.module.js';
import {PHYSICS_DT,stepVehicle} from './physics.mjs';

const $ = id => document.getElementById(id);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const rad=Math.PI/180;
const WHEELBASE_SCALE=0.0001;
const models=[
 ['Nissan 180SX','Nissan','hatch',4520,2475,1690,6.5],
 ['Nissan 200SX S13','Nissan','hatch',4520,2475,1690,6.5],
 ['Nissan 240SX S13','Nissan','hatch',4520,2475,1690,6.5],
 ['Nissan Silvia S13','Nissan','coupe',4470,2475,1690,6.7],
 ['Nissan Silvia S14','Nissan','coupe',4520,2525,1730,7.1],
 ['Nissan 240SX S14','Nissan','coupe',4520,2525,1730,7.1],
 ['Nissan Silvia S15 Spec-R','Nissan','coupe',4445,2525,1695,7.7],
 ['Nissan Skyline R30','Skyline','sedan',4600,2615,1675,6.3],
 ['Nissan Skyline R31','Skyline','sedan',4660,2615,1690,6.5],
 ['Nissan Skyline R32 GT-R','Skyline','coupe',4545,2615,1755,7.7],
 ['Nissan Skyline R33 GT-R','Skyline','coupe',4675,2720,1780,7.5],
 ['Nissan Skyline R34 GT-R','Skyline','coupe',4600,2665,1785,8.1],
 ['Nissan Skyline R34 Sedan','Skyline','sedan',4705,2665,1720,6.6],
 ['Nissan Skyline V35','Skyline','coupe',4640,2850,1815,7.3],
 ['Nissan Skyline V36','Skyline','coupe',4655,2850,1820,7.4],
 ['Nissan Skyline V37','Skyline','sedan',4790,2850,1820,7.5],
 ['Nissan GT-R R35','Skyline','super',4710,2780,1895,9.2],
 ['Toyota AE86 Trueno','Toyota','hatch',4215,2400,1625,6.1],
 ['Toyota Chaser JZX100','Toyota','sedan',4715,2730,1755,7.4],
 ['Toyota Chaser JZX100 Kouki','Toyota','sedan',4715,2730,1755,7.5],
 ['Toyota Supra A80','Toyota','super',4520,2550,1810,8.5],
 ['BMW E30 M3','BMW','coupe',4345,2565,1680,7.2],
 ['BMW E46 M3','BMW','coupe',4492,2731,1780,7.9],
 ['Mazda RX-7 FC3S','Mazda','hatch',4310,2430,1690,7.5],
 ['Mazda RX-7 FD3S','Mazda','super',4285,2425,1760,8.6],
 ['Mazda RX-8 SE3P','Mazda','coupe',4435,2700,1770,7.4],
 ['Toyota GR86 D1 · Inspired','D1','d1',4265,2575,1775,9.0],
 ['Nissan S15 D1 · Inspired','D1','d1',4445,2525,1770,9.3]
];
// Sizes are representative catalogue guidance in millimetres, not scanned meshes.
const CARS=models.map((d,i)=>({id:i,name:d[0],brand:d[1],type:d[2],L:d[3]/10000,wb:d[4]*WHEELBASE_SCALE,W:d[5]/10000,power:d[6]}));
const TRACKS=[
 {id:'ebisu',name:'HILL DRIFT',caption:'D1 Ebisu inspiriert: bergige Kurven und Clipping-Zonen. Fantasie-Layout für RC 1:10.',theme:'hill',pts:[[-9,-3],[-5,-4.5],[1,-4.8],[7,-3],[9,0],[7,3],[3,4],[0,1.5],[-3,2.3],[-7,4],[-10,1.5]]},
 {id:'tsukuba',name:'TECHNICAL GP',caption:'Technische Rundstrecke mit Schikane und Gegenkurven, keine vermessene Tsukuba-Kopie.',theme:'arena',pts:[[-11,-2],[-6,-4],[1,-4],[7,-4],[10,-1],[9,3],[5,4],[2,1.3],[-1,0.5],[-4,4],[-9,3],[-11,0]]},
 {id:'city',name:'NIGHT DOCK',caption:'Beleuchtete Stadtkulisse und Betonwände, frei gestaltete D1-Stadtkurs-Atmosphäre.',theme:'city',pts:[[-9,-3],[-4,-4],[3,-3],[8,-1],[9,3],[5,4],[1,3],[-1,0],[-5,2],[-8,3],[-11,0]]}
];
const PAINTS=[0xdf272f,0x3c67d6,0xeeeeeb,0x171d27,0x22a293,0x9e59c4,0xee9d27,0x8794a0];
const state={car:6,track:0,mode:'free',camera:0,paint:0,quality:'auto',time:0,round:0,score:0,best:0,combo:1,scoreHold:0,lap:0,steering:48,grip:56,gyro:54,
    carState:{x:0,z:0,yaw:0,vx:0,vz:0,yawRate:0,steer:0}, controls:{left:false,right:false,throttle:false,brake:false,handbrake:false}};
const scene=new THREE.Scene();scene.background=new THREE.Color(0x889eb0);scene.fog=new THREE.Fog(0x889eb0,12,39);
const camera=new THREE.PerspectiveCamera(58,window.innerWidth/window.innerHeight,.014,130);
const renderer=new THREE.WebGLRenderer({canvas:$('render'),antialias:true,powerPreference:'high-performance'});
renderer.setSize(window.innerWidth,window.innerHeight);renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.6));
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.28;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
scene.add(new THREE.HemisphereLight(0xe8f3ff,0x4c573e,2.0));
const sun=new THREE.DirectionalLight(0xfff1d9,2.0);sun.position.set(-8,17,9);sun.castShadow=true;
sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-24;sun.shadow.camera.right=24;
sun.shadow.camera.top=24;sun.shadow.camera.bottom=-24;sun.shadow.camera.near=.1;sun.shadow.camera.far=48;
scene.add(sun);
const asphaltMat=new THREE.MeshStandardMaterial({color:0x303840,roughness:.93});
const mat=(color,rough=.55,metal=.08)=>new THREE.MeshStandardMaterial({color,roughness:rough,metalness:metal});
const glass=mat(0x17212a,.18,.18),rubber=mat(0x121417,1),metal=mat(0x9daebd,.24,.84),black=mat(0x070b0f,.66),lamp=mat(0xe4f4ff,.15);
const wheelGeo=new THREE.CylinderGeometry(.038,.038,.021,18,1);
const rimGeo=new THREE.CylinderGeometry(.024,.024,.022,16);
const spokeGeo=new THREE.BoxGeometry(.004,.033,.003);
const box=(w,h,d,m,x=0,y=0,z=0)=>{const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);o.position.set(x,y,z);return o;};
function addBox(g,w,h,d,m,x,y,z){let o=box(w,h,d,m,x,y,z);g.add(o);return o;}
function shapeMesh(stations,material){
 const v=[],indices=[];
 for(const s of stations){v.push(-s.w,s.y,s.z,s.w,s.y,s.z);}
 for(let i=0;i<stations.length-1;i++){let a=i*2,b=a+1,c=a+2,d=a+3;indices.push(a,c,b,b,c,d);}
 const sideV=[];
 for(let side of [-1,1])for(let i=0;i<stations.length-1;i++){
   const p=stations[i],q=stations[i+1];
   sideV.push(side*p.w,.053,p.z,side*q.w,.053,q.z,side*q.w,q.y,q.z,
              side*p.w,.053,p.z,side*q.w,q.y,q.z,side*p.w,p.y,p.z);
 }
 const pos=new Float32Array(v.concat(sideV));
 const base=v.length/3;
 for(let i=0;i<sideV.length/9;i++)indices.push(base+i*3,base+i*3+1,base+i*3+2);
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(pos,3));geo.setIndex(indices);geo.computeVertexNormals();
 const mesh=new THREE.Mesh(geo,material);mesh.material.side=THREE.DoubleSide;mesh.castShadow=true;mesh.receiveShadow=true;return mesh;
}
function poly(g,verts,material){
 const p=[];for(let i=1;i<verts.length-1;i++)p.push(...verts[0],...verts[i],...verts[i+1]);
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(p,3));geo.computeVertexNormals();
 const o=new THREE.Mesh(geo,material);o.material.side=THREE.DoubleSide;g.add(o);return o;
}
function createCar(def,color){
 const root=new THREE.Group(),visual=new THREE.Group();root.add(visual);
 const L=def.L,W=def.W,wb=def.wb,front=L/2,rear=-front;
 const paint=mat(color,.28,.54);const darker=mat(new THREE.Color(color).multiplyScalar(.78),.42,.42);
 const width=W/2;
 const st=[
 {z:rear,w:width*.75,y:.083},{z:rear+.028,w:width*.97,y:.125},
 {z:-L*.23,w:width,y:.142},{z:L*.22,w:width*.98,y:.143},
 {z:front-.024,w:width*.91,y:.128},{z:front,w:width*.71,y:.09}
 ];
 visual.add(shapeMesh(st,paint));
 addBox(visual,W*.83,.023,L*.88,paint,0,.071,0);
 // Cabins: coupe, sedan, hatch and lower sports-body geometry.
 const sedan=def.type==='sedan',hatch=def.type==='hatch',supercar=def.type==='super',d1=def.type==='d1';
 const roofTop=supercar?.239:(sedan?.272:.262);
 const roofBack=sedan?-L*.25:(hatch?-L*.20:-L*.17);
 const roofFront=sedan?L*.085:L*.052;
 const deckBack=sedan?-L*.35:-L*.34;
 const glassBackY=.146,glassFrontY=.145;
 const cw=width*.82,rw=width*.70;
 const roof=box(rw*2,.012,roofFront-roofBack,paint,0,roofTop, (roofFront+roofBack)/2);
 visual.add(roof);roof.castShadow=true;
 poly(visual,[[-cw,glassBackY,deckBack],[cw,glassBackY,deckBack],[rw,roofTop,roofBack],[-rw,roofTop,roofBack]],glass);
 poly(visual,[[-rw,roofTop,roofFront],[rw,roofTop,roofFront],[cw,glassFrontY,L*.205],[-cw,glassFrontY,L*.205]],glass);
 for(let side of [-1,1]){
   poly(visual,[[side*cw,glassBackY,deckBack],[side*rw,roofTop,roofBack],[side*rw,roofTop,roofFront],[side*cw,glassFrontY,L*.205]],glass);
   const doorLine=addBox(visual,.001,.003,L*.22,darker,side*(width+.001),.142,-.018);
   doorLine.rotation.x=0; // fine door shut line
   addBox(visual,.008,.007,.017,black,side*(width+.023),.172,L*.10); // mirrors
   addBox(visual,.001,.009,.035,metal,side*(width+.001),.147,-.065); // handles
   // side skirts and wheel arch trim
   addBox(visual,.012,.022,L*.35,darker,side*(width+.004),.074,.002);
 }
 // B-pillars on sedans and coupes, original geometric details.
 for(let side of [-1,1]) {
   const pillar=addBox(visual,.006,.085,.006,black,side*rw,.207,sedan?-.032:-.028);
   pillar.rotation.x= -.08;
 }
 // Front splitter, rear bumper, grill, and lamps.
 addBox(visual,W*.74,.028,.013,black,0,.080,front-.001);
 addBox(visual,W*.65,.013,.012,black,0,.094,front+.002);
 addBox(visual,W*.79,.025,.014,darker,0,.077,rear+.002);
 const round=def.brand==='Skyline'||def.name.includes('RX-7 FD');
 const popup=def.name.includes('180SX')||def.name.includes('200SX')||def.name.includes('240SX S13')||def.name.includes('RX-7 FC')||def.name.includes('AE86');
 for(const side of [-1,1]){
   const x=side*width*.60;
   if(round){
      let geo=new THREE.SphereGeometry(.012,10,8);
      for(let dx of [-.013,.013]){
        let l=new THREE.Mesh(geo,lamp);l.position.set(x+dx,.133,front-.004);visual.add(l);
      }
   }else{
      let l=addBox(visual,W*.22,popup?.012:.015,.008,popup?darker:lamp,x,.133,front-.002);
      l.rotation.y=side*.10;
   }
   const tail=mat(0xd72e35,.28,.1);
   if(def.brand==='Skyline'){
      for(let dx of [-.011,.011]){
         const l=new THREE.Mesh(new THREE.SphereGeometry(.011,12,8),tail);
         l.position.set(x+dx,.121,rear-.002);visual.add(l);
      }
   } else addBox(visual,W*.22,.018,.008,tail,x,.116,rear-.002);
 }
 if(def.brand==='BMW'){
    for(let side of [-1,1])addBox(visual,.022,.028,.008,black,side*.016,.109,front+.004);
 }
 // Wheels: RC hard compound tires, rim, lug detail, steering pivots.
 const wheels=[];
 for(const zz of [-wb/2,wb/2])for(const side of [-1,1]){
   const pivot=new THREE.Group();pivot.position.set(side*(width+.007),.075,zz);visual.add(pivot);
   const tire=new THREE.Mesh(wheelGeo,rubber);tire.rotation.z=Math.PI/2;tire.castShadow=true;pivot.add(tire);
   const rim=new THREE.Mesh(rimGeo,metal);rim.rotation.z=Math.PI/2;rim.position.x=side*.002; pivot.add(rim);
   for(let n=0;n<5;n++){
     const t=n*Math.PI*2/5;
     const spoke=box(.003,.029,.004,black,side*.016,Math.sin(t)*.010,Math.cos(t)*.010);
     spoke.rotation.x=t;pivot.add(spoke);
   }
   if(def.type==='d1'||def.brand==='Skyline'){
     const flare=new THREE.Mesh(new THREE.TorusGeometry(.043,.004,5,16,Math.PI),darker);
     flare.rotation.y=Math.PI/2;flare.rotation.z=Math.PI/2;flare.position.set(side*(width+.002),.083,zz);visual.add(flare);
   }
   wheels.push({pivot,front:zz>0});
 }
 const wing=def.type==='d1'||def.name.includes('GT-R')||def.name.includes('Supra')||def.name.includes('RX-7 FD');
 if(wing){
   const big=def.type==='d1';
   const wh=big?.21:.16;addBox(visual,W*.08,wh-.10,.010,black,-W*.24,(wh+.1)/2,rear+.045);
   addBox(visual,W*.08,wh-.10,.010,black,W*.24,(wh+.1)/2,rear+.045);
   addBox(visual,W*(big?1.12:.88),.013,.041,darker,0,wh,rear+.042);
 }
 if(def.type==='d1'){
   addBox(visual,W*1.10,.007,.058,black,0,.059,front);
   for(let side of [-1,1]){
     addBox(visual,.007,.030,L*.32,black,side*(width+.010),.064,.002);
     addBox(visual,.008,.018,L*.20,paint,side*(width+.005),.142,-.04);
   }
 }
 root.userData={wheels,paint,def};root.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true}});
 return root;
}
const curveFor=pts=>new THREE.CatmullRomCurve3(pts.map(p=>new THREE.Vector3(p[0],0,p[1])),true,'catmullrom',.36);
const trackGroup=new THREE.Group();scene.add(trackGroup);
const trackSamples=240;
let curve=null,line=[],roadWidth=1.55,car=null,aiCar=null,sceneCars=[];
const smoke=[];const smokeGeometry=new THREE.SphereGeometry(.04,6,5);let smokeClock=0,frameCount=0;
const groundMat=mat(0x515e38,.99);
function addTrackObj(o){trackGroup.add(o);return o;}
function makeRoad(curve,width){
  const verts=[],indices=[],uvs=[];
  for(let i=0;i<=trackSamples;i++){
   const p=curve.getPointAt(i/trackSamples),t=curve.getTangentAt(i/trackSamples);
   const nx=t.z,nz=-t.x;
   verts.push(p.x-nx*width/2,.016,p.z-nz*width/2,p.x+nx*width/2,.016,p.z+nz*width/2);
   uvs.push(0,i/7,1,i/7);
   if(i<trackSamples){let j=i*2;indices.push(j,j+1,j+2,j+1,j+3,j+2);}
  }
  const geom=new THREE.BufferGeometry();geom.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));geom.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geom.setIndex(indices);geom.computeVertexNormals();
  const road=addTrackObj(new THREE.Mesh(geom,asphaltMat));road.receiveShadow=true;
  return road;
}
function makeEdge(curve,width,side){
 const pts=[];for(let i=0;i<=trackSamples;i++){const p=curve.getPointAt(i/trackSamples),t=curve.getTangentAt(i/trackSamples);pts.push(new THREE.Vector3(p.x+side*t.z*width/2,.028,p.z-side*t.x*width/2));}
 const geo=new THREE.BufferGeometry().setFromPoints(pts);
 addTrackObj(new THREE.Line(geo,new THREE.LineBasicMaterial({color:0xf6ede5,transparent:true,opacity:.82})));
}
function cone(x,z){
 const g=new THREE.Group();g.position.set(x,.017,z);
 g.add(box(.055,.01,.055,black,0,.006,0));
 const body=new THREE.Mesh(new THREE.ConeGeometry(.026,.084,7),mat(0xff752e,.72));body.position.y=.053;g.add(body);
 const stripe=new THREE.Mesh(new THREE.CylinderGeometry(.015,.019,.012,7),lamp);stripe.position.y=.052;g.add(stripe);
 addTrackObj(g);
}
function tree(x,z){
 const g=new THREE.Group();g.position.set(x,0,z);
 g.add(box(.055,.42,.055,mat(0x56452c),0,.2,0));
 const top=new THREE.Mesh(new THREE.ConeGeometry(.36,.83,7),mat(0x335e38,.98));top.position.y=.73;g.add(top);addTrackObj(g);
}
function streetLamp(x,z){
 const g=new THREE.Group();g.position.set(x,0,z);
 g.add(box(.032,1.1,.032,metal,0,.55,0));
 g.add(box(.14,.037,.09,black,.07,1.10,0));
 const light=new THREE.Mesh(new THREE.SphereGeometry(.039,6,6),new THREE.MeshBasicMaterial({color:0xffe5b1}));light.position.set(.12,1.07,0);g.add(light);
 addTrackObj(g);
}
function barrier(x,z,a){
 const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=a;
 g.add(box(.45,.16,.08,mat(0xb8bdc3,.91),0,.08,0));
 g.add(box(.25,.055,.085,mat(0xcd383a,.8),0,.12,0));
 addTrackObj(g);
}
function buildTrack(idx){
 // Keep vehicle scene objects separate so changing tracks never destroys car state.
 while(trackGroup.children.length){
   const o=trackGroup.children[0];trackGroup.remove(o);
   o.traverse(n=>{if(n.geometry)n.geometry.dispose();if(n.material&&n.material!==asphaltMat&&!Object.values({groundMat}).includes(n.material)&&n.material.dispose)n.material.dispose();});
 }
 const t=TRACKS[idx];curve=curveFor(t.pts);line=curve.getSpacedPoints(160);roadWidth=t.theme==='arena'?1.75:1.55;
 const night=t.theme==='city';
 scene.background=new THREE.Color(night?0x0b1627:0xa9bfd0);
 scene.fog=new THREE.Fog(night?0x0b1627:0xa9bfd0,14,night?29:43);
 sun.intensity=night?.32:2;sun.position.set(-6,15,7);
 groundMat.color.setHex(t.theme==='hill'?0x527045:(night?0x252c33:0x66746b));
 const ground=addTrackObj(box(64,.12,64,groundMat,0,-.06,0));ground.receiveShadow=true;
 makeRoad(curve,roadWidth);makeEdge(curve,roadWidth,-1);makeEdge(curve,roadWidth,1);
 const laneMat=new THREE.MeshBasicMaterial({color:0xe9dfac});
 for(let i=0;i<110;i+=5){
   const u=i/110,p=curve.getPointAt(u),tang=curve.getTangentAt(u);
   const mark=box(.018,.004,.18,laneMat,p.x,.022,p.z);
   mark.rotation.y=Math.atan2(tang.x,tang.z);addTrackObj(mark);
 }
 const colorMat=mat(0xffdf55,.6);
 for(let i=0;i<18;i++){
  const u=(i+.45)/18,p=curve.getPointAt(u),tang=curve.getTangentAt(u),sign=i%2?1:-1;
  const x=p.x+sign*tang.z*roadWidth*.64,z=p.z-sign*tang.x*roadWidth*.64;
  if(i%3===0)cone(x,z);
  else if(t.theme==='hill')tree(x+sign*.6,z);
  else if(night)streetLamp(x+sign*.5,z);
  else barrier(x,z,Math.atan2(tang.x,tang.z));
 }
 for(let i=0;i<5;i++){
  const p=curve.getPointAt((i+.12)/5),tang=curve.getTangentAt((i+.12)/5);
  const x=p.x+tang.z*roadWidth*.62,z=p.z-tang.x*roadWidth*.62;
  const marker=new THREE.Mesh(new THREE.SphereGeometry(.07,8,7),colorMat);marker.position.set(x,.07,z);addTrackObj(marker);
 }
 if(t.theme==='city'){
   const rng=n=>Math.sin(n*54.13)*.5+.5;
   for(let i=0;i<58;i++){
     const x=Math.floor(i%10)*2.7-12,z=Math.floor(i/10)*3.5-9;
     let outside=true;for(let p of line){if((p.x-x)**2+(p.z-z)**2<4.2){outside=false;break;}}
     if(outside){
       const b=box(.9+(.7*rng(i)),.8+1.4*rng(i+1),.9,mat(0x394352,.92),x,.7,z);addTrackObj(b);
       if(i%2) addTrackObj(box(.44,.012,.045,new THREE.MeshBasicMaterial({color:0xffdd80}),x,.8,z+.46));
     }
   }
 }
 const start=curve.getPointAt(0),tangent=curve.getTangentAt(0);
 state.carState={x:start.x,z:start.z,yaw:Math.atan2(tangent.x,tangent.z),vx:0,vz:0,yawRate:0,steer:0};
 state.time=0;state.round=0;state.score=0;state.combo=1;state.lap=0;state.scoreHold=0;
 $('caption').textContent=t.caption;
}
function disposeCar(root){
 if(!root)return;
 const geos=new Set(),mats=new Set(),protectedMaterials=new Set([glass,rubber,metal,black,lamp]);
 root.traverse(o=>{
   if(!o.isMesh)return;
   if(o.geometry&&o.geometry!==wheelGeo&&o.geometry!==rimGeo&&o.geometry!==spokeGeo)geos.add(o.geometry);
   if(o.material&&!protectedMaterials.has(o.material))mats.add(o.material);
 });
 geos.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());
}
function setCar(i){
 state.car=i;const d=CARS[i];if(car){scene.remove(car);disposeCar(car);sceneCars=sceneCars.filter(x=>x!==car);}
 car=createCar(d,PAINTS[state.paint]);scene.add(car);sceneCars.push(car);
 car.position.set(state.carState.x,.014,state.carState.z);
 if(aiCar){scene.remove(aiCar);disposeCar(aiCar);aiCar=null;}
 if(state.mode==='tandem'){aiCar=createCar(CARS[(i+1)%CARS.length],0xffbb44);scene.add(aiCar);}
 $('carstats').textContent='1:10 · Länge '+Math.round(d.L*1000)+' mm · Radstand '+Math.round(d.wb*1000)+' mm · Heckantrieb · Leistung '+d.power.toFixed(1)+'/10';
 updateControls(); savePrefs();
}
function resetCar(){
 const p=curve.getPointAt(0),t=curve.getTangentAt(0);
 Object.assign(state.carState,{x:p.x,z:p.z,yaw:Math.atan2(t.x,t.z),vx:0,vz:0,yawRate:0,steer:0});
 state.round=0;state.time=0;state.score=0;state.combo=1;state.lap=0;state.scoreHold=0;
}
function savePrefs(){try{localStorage.setItem('dq.d1.78',JSON.stringify({car:state.car,track:state.track,mode:state.mode,paint:state.paint,steering:state.steering,grip:state.grip,gyro:state.gyro,quality:state.quality,best:state.best}));}catch(e){}}
function loadPrefs(){try{const p=JSON.parse(localStorage.getItem('dq.d1.78')||'null');if(!p)return;
 for(let k of ['car','track','mode','paint','steering','grip','gyro','quality','best'])if(p[k]!==undefined)state[k]=p[k];
 state.car=clamp(state.car,0,CARS.length-1);state.track=clamp(state.track,0,TRACKS.length-1);state.paint=clamp(state.paint,0,PAINTS.length-1);
 }catch(e){}}
let renderPixelRatio=1.4;
function setQuality(q){
 state.quality=q;
 renderPixelRatio=q==='high'?2:q==='medium'?1.5:q==='low'?1:1.35;
 renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,renderPixelRatio));
 renderer.shadowMap.enabled=q!=='low';
 renderer.setSize(innerWidth,innerHeight);
 savePrefs();
}
function adaptGraphics(fps){
 if(state.quality!=='auto')return;
 const target= fps<46 ? Math.max(.75,renderPixelRatio-.12) : fps>58 ? Math.min(1.55,renderPixelRatio+.04) : renderPixelRatio;
 if(Math.abs(target-renderPixelRatio)>.005){
   renderPixelRatio=target;
   renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,renderPixelRatio));
 }
}
function updateControls(){
 $('vehicle').value=String(state.car);
 for(const el of document.querySelectorAll('[data-track]'))el.classList.toggle('active',+el.dataset.track===state.track);
 for(const el of document.querySelectorAll('[data-mode]'))el.classList.toggle('active',el.dataset.mode===state.mode);
 for(const el of document.querySelectorAll('[data-paint]'))el.classList.toggle('active',+el.dataset.paint===state.paint);
 for(const k of ['steering','grip','gyro']){$(k).value=state[k];$(k+'Val').textContent=state[k]+(k==='steering'?'°':'%');}
 $('quality').value=state.quality;
}
function controlsInit(){
 const select=$('vehicle');CARS.forEach((c,i)=>{let o=document.createElement('option');o.value=i;o.textContent=c.name;select.appendChild(o);});
 select.addEventListener('change',()=>setCar(+select.value));
 TRACKS.forEach((t,i)=>{const b=document.createElement('button');b.className='chip';b.dataset.track=i;b.textContent=t.name;b.onclick=()=>{state.track=i;buildTrack(i);updateControls();savePrefs();};$('tracks').appendChild(b);});
 [['free','FREE RIDE'],['qual','D1 SOLO'],['tandem','TANDEM AI']].forEach(v=>{
 const b=document.createElement('button');b.className='chip';b.dataset.mode=v[0];b.textContent=v[1];
 b.onclick=()=>{state.mode=v[0];resetCar();setCar(state.car);updateControls();};$('modes').appendChild(b);
 });
 PAINTS.forEach((hex,i)=>{const b=document.createElement('button');b.className='chip';b.dataset.paint=i;b.title='Lack '+(i+1);b.style.background='#'+hex.toString(16).padStart(6,'0');b.style.width='28px';b.style.height='27px';b.style.padding='0';b.onclick=()=>{state.paint=i;setCar(state.car);};$('paints').appendChild(b);});
 ['steering','grip','gyro'].forEach(k=>$(k).oninput=()=>{state[k]=+$(k).value;updateControls();savePrefs();});
 $('quality').onchange=e=>setQuality(e.target.value);
 $('togglePanel').onclick=()=>$('panel').classList.toggle('hidden');
 $('camera').onclick=()=>{state.camera=(state.camera+1)%3;};
 $('reset').onclick=resetCar;
 const keys={ArrowLeft:'left',KeyA:'left',ArrowRight:'right',KeyD:'right',ArrowUp:'throttle',KeyW:'throttle',ArrowDown:'brake',KeyS:'brake',Space:'handbrake'};
 window.addEventListener('keydown',e=>{if(e.code==='KeyR'){resetCar();return;}const k=keys[e.code];if(k){e.preventDefault();state.controls[k]=true;startAudio();}});
 window.addEventListener('keyup',e=>{const k=keys[e.code];if(k){e.preventDefault();state.controls[k]=false;}});
 document.querySelectorAll('[data-control]').forEach(b=>{
   const k=b.dataset.control;
   const press=e=>{e.preventDefault();b.setPointerCapture?.(e.pointerId);state.controls[k]=true;b.classList.add('active');startAudio();};
   const release=e=>{e.preventDefault();state.controls[k]=false;b.classList.remove('active');};
   b.addEventListener('pointerdown',press);b.addEventListener('pointerup',release);b.addEventListener('pointercancel',release);b.addEventListener('lostpointercapture',release);
 });
 window.addEventListener('blur',()=>Object.keys(state.controls).forEach(k=>state.controls[k]=false));
}
let audioCtx,osc,gain;
function startAudio(){
 if(audioCtx){if(audioCtx.state==='suspended')audioCtx.resume().catch(()=>{});return;}
 try{audioCtx=new (window.AudioContext||window.webkitAudioContext)();osc=audioCtx.createOscillator();gain=audioCtx.createGain();
 osc.type='sawtooth';gain.gain.value=.008;osc.connect(gain);gain.connect(audioCtx.destination);osc.start();}catch(e){}
}
function closestRoad(x,z){
 let min=999;
 for(let i=0;i<line.length;i+=2){const p=line[i];let d=(p.x-x)**2+(p.z-z)**2;if(d<min)min=d;}return Math.sqrt(min);
}
let telemetry={forward:0,lateral:0,speed:0,driftAngle:0,yawRate:0,off:false};
function updateSim(dt){
 const c=state.carState,k=state.controls,def=CARS[state.car];
 telemetry=stepVehicle(c,k,{
   wheelbase:def.wb,power:def.power,
   steering:state.steering,grip:state.grip,gyro:state.gyro
 },dt);
 if(Math.abs(c.x)>220||Math.abs(c.z)>220){resetCar();return;}
 const off=closestRoad(c.x,c.z)>roadWidth*.67;
 telemetry.off=off;
 if(off){const drag=Math.exp(-dt*.95);c.vx*=drag;c.vz*=drag;}
 const absSlip=Math.abs(telemetry.driftAngle),speed=telemetry.speed;
 state.time+=dt;
 if(speed>1.3&&absSlip>10&&absSlip<73&&!off){
   state.score+=dt*(absSlip-8)*speed*1.6*state.combo;
   state.scoreHold=0;
   state.combo=clamp(state.combo+dt*.18,1,4);
 }else{
   state.scoreHold+=dt;
   if(state.scoreHold>1.8)state.combo=1;
 }
 if(state.mode==='qual'&&state.time>90){
   state.best=Math.max(state.best,Math.round(state.score));
   $('status').textContent='D1 SOLO · 90 s vorbei · '+Math.round(state.score)+' Punkte · Bestwert '+state.best+' · RESET für neuen Lauf';
   state.mode='free';savePrefs();updateControls();
 }
}
function updateHud(fps){
 const c=state.carState,k=state.controls;
 if(car){
   car.position.set(c.x,.015,c.z);car.rotation.y=c.yaw;
   for(const wheel of car.userData.wheels)if(wheel.front)wheel.pivot.rotation.y=-c.steer*state.steering*rad*.53;
 }
 if(state.mode==='tandem'&&aiCar){
   const u=(state.time*.032+.015)%1,p=curve.getPointAt(u),t=curve.getTangentAt(u);
   aiCar.position.set(p.x,.015,p.z);
   aiCar.rotation.y=Math.atan2(t.x,t.z);
 }
 $('speed').innerHTML=Math.round(telemetry.speed*3.6)+' <small>km/h</small>';
 $('angle').textContent='DRIFT '+Math.round(Math.abs(telemetry.driftAngle))+'°'+(telemetry.off?' · OFFROAD':'');
 $('score').textContent=Math.round(state.score).toLocaleString('de-DE')+' PTS';
 $('combo').textContent='COMBO ×'+state.combo.toFixed(1)+(state.mode==='qual'?' · '+Math.max(0,Math.ceil(90-state.time))+' s':'');
 $('fps').textContent=fps>0?Math.round(fps)+' FPS · '+(state.quality==='auto'?'AUTO':'MANUELL'):'FPS ...';
 if(audioCtx&&osc)osc.frequency.setTargetAtTime(74+Math.abs(telemetry.forward)*34+(k.throttle?40:0),audioCtx.currentTime,.06);
}
function emitSmoke(c,fx,fz){
 for(let side of [-1,1]){
  if(smoke.length>80){const s=smoke.shift();scene.remove(s.obj);s.obj.material.dispose();}
  const smokeMat=new THREE.MeshBasicMaterial({color:0xe6e9ec,transparent:true,opacity:.30,depthWrite:false});
  const obj=new THREE.Mesh(smokeGeometry,smokeMat);
  obj.position.set(c.x-fx*.13+side*Math.cos(c.yaw)*.085,.08,c.z-fz*.13-side*Math.sin(c.yaw)*.085);
  scene.add(obj);smoke.push({obj,age:0});
 }
}
const follower=new THREE.Vector3(0,1.4,-2.0),target=new THREE.Vector3();
function updateVisual(dt){
 if(car){
  const c=state.carState;
  let dist=state.camera===1?1.7:state.camera===2?3:1.3;
  const dx=Math.sin(c.yaw),dz=Math.cos(c.yaw);
  if(state.camera===2)target.set(c.x,4.3,c.z+.001);
  else if(state.camera===1)target.set(c.x+dz*.65,.63,c.z-dx*.65);
  else target.set(c.x-dx*dist,.55,c.z-dz*dist);
  follower.lerp(target,Math.min(1,dt*4));
  camera.position.copy(follower);
  if(state.camera===2){camera.lookAt(c.x,0,c.z);}else camera.lookAt(c.x+dx*.36,.09,c.z+dz*.36);
 }
 const c=state.carState;
 if(Math.abs(telemetry.driftAngle)>11&&telemetry.speed>2&&state.controls.throttle){
   smokeClock+=dt;
   if(smokeClock>.075){
     smokeClock=0;
     emitSmoke(c,Math.sin(c.yaw),Math.cos(c.yaw));
   }
 }else smokeClock=0;
 for(let i=smoke.length-1;i>=0;i--){
   const s=smoke[i];s.age+=dt;s.obj.position.y+=dt*.18;s.obj.scale.setScalar(1+s.age*2.1);
   s.obj.material.opacity=Math.max(0,.29*(1-s.age/1.15));
   if(s.age>1.15){scene.remove(s.obj);s.obj.material.dispose();smoke.splice(i,1);}
 }
}
const clock=new THREE.Clock();
let accumulator=0,fpsSeconds=0,fpsFrames=0,lastFps=0;
function animate(){
 requestAnimationFrame(animate);
 const realDt=clock.getDelta();
 accumulator+=Math.min(realDt,.08);
 let iterations=0;
 while(accumulator>=PHYSICS_DT && iterations<10){
   updateSim(PHYSICS_DT);
   accumulator-=PHYSICS_DT;iterations++;
 }
 if(iterations===10 && accumulator>PHYSICS_DT)accumulator=0; // avoid catch-up spiral
 const renderDt=Math.min(realDt,.05);
 updateVisual(renderDt);
 updateHud(lastFps);
 renderer.render(scene,camera);
 fpsSeconds+=realDt;fpsFrames++;
 if(fpsSeconds>=1.0){
   lastFps=fpsFrames/fpsSeconds;
   adaptGraphics(lastFps);
   fpsFrames=0;fpsSeconds=0;
 }
 frameCount++;
}
try{
 loadPrefs();controlsInit();buildTrack(state.track);setCar(state.car);setQuality(state.quality);updateControls();
 window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
 animate();
} catch(e){
 console.error('DRIVE QUER D1 LAB',e);$('err').style.display='block';$('err').textContent='3D-Startfehler: '+e.message+' · Bitte WebGL im Browser aktivieren.';
}
