import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {PHYSICS_DT,stepVehicle} from '../physics.mjs';
const dir=path.resolve(import.meta.dirname,'..');
const js=fs.readFileSync(path.join(dir,'game.js'),'utf8');
const html=fs.readFileSync(path.join(dir,'index.html'),'utf8');
new vm.Script(js.replace(/^import .*?;\n/gm,''));
const matches=js.match(/const models=\[([\s\S]*?)\];/);
assert.ok(matches,'Fahrzeugkatalog fehlt');
const cars=vm.runInNewContext('['+matches[1]+']');
assert.equal(cars.length,28,'28 Fahrzeuge erwartet');
const trackSection=js.match(/const TRACKS=\[([\s\S]*?)\];/);
assert.ok(trackSection,'Streckenkatalog fehlt');
const tracks=vm.runInNewContext('['+trackSection[1]+']');
assert.equal(tracks.length,3,'3 Strecken erwartet');
for(const id of ['render','vehicle','steering','grip','gyro','tracks','modes','quality','togglePanel','camera','reset','status','fps']){
  assert.ok(html.includes('id="'+id+'"'),'UI-Element fehlt: '+id);
}
for(const mode of ['free','qual','tandem'])assert.ok(js.includes("['"+mode+"'"),'Modus fehlt: '+mode);
for(const control of ['left','right','throttle','brake','handbrake'])assert.ok(html.includes('data-control="'+control+'"'),'Steuerung fehlt: '+control);
assert.ok(js.includes("../vendor/three.module.js"),'Lokales Three.js fehlt');
console.log('DRIVE QUER: JS-Syntax OK, '+cars.length+' Fahrzeuge, '+tracks.length+' Strecken, Eingaben und UI OK.');

assert.ok(js.includes('stepVehicle(c,k,'),'Fahrphysik nicht eingebunden');
assert.ok(js.includes('while(accumulator>=PHYSICS_DT'),'120-Hz-Simulation nicht eingebunden');
assert.ok(js.includes('adaptGraphics(lastFps)'),'Adaptive Aufloesung fehlt');
const base=()=>({x:0,z:0,yaw:0,vx:0,vz:0,yawRate:0,steer:0});
const tuning={wheelbase:.2525,power:7.7,steering:48,grip:56,gyro:54};
function simulate(input,seconds=2){
 const car=base();let data;
 for(let step=0;step<Math.round(seconds/PHYSICS_DT);step++)data=stepVehicle(car,input,tuning,PHYSICS_DT);
 return {car,data};
}
const accelerating=simulate({throttle:true},2);
assert.ok(accelerating.data.speed>1.2,'Gas erzeugt keine Fahrt');
assert.ok(Math.abs(accelerating.car.x)<.001,'Ohne Lenken seitliche Drift');
const left=simulate({throttle:true,left:true},2);
const right=simulate({throttle:true,right:true},2);
assert.ok(left.car.yaw<-.1,'Linkseinschlag lenkt nicht links');
assert.ok(right.car.yaw>.1,'Rechtseinschlag lenkt nicht rechts');
assert.ok(Math.abs(left.data.driftAngle)>1,'Seitenschlupf fehlt');
function brakeScenario(brake){
 const car=base();
 for(let i=0;i<180;i++)stepVehicle(car,{throttle:true},tuning,PHYSICS_DT);
 for(let i=0;i<60;i++)stepVehicle(car,brake?{brake:true}:{},tuning,PHYSICS_DT);
 return Math.hypot(car.vx,car.vz);
}
assert.ok(brakeScenario(true)<brakeScenario(false),'Bremse verzoegert nicht');
const drift=simulate({throttle:true,handbrake:true,left:true},3);
assert.ok(Number.isFinite(drift.data.driftAngle),'Handbremsen-Drift nicht endlich');
const compare=(renderFps)=>{
 const car=base();let accumulator=0;
 const frames=renderFps*2;
 for(let frame=0;frame<frames;frame++){
  accumulator+=1/renderFps;
  while(accumulator>=PHYSICS_DT-1e-9){
   stepVehicle(car,{throttle:true,left:true},tuning,PHYSICS_DT);
   accumulator-=PHYSICS_DT;
  }
 }
 return car;
};
const a30=compare(30),a60=compare(60),a120=compare(120);
for(const key of ['x','z','yaw','vx','vz']){
 assert.ok(Math.abs(a30[key]-a60[key])<1e-8,'30 und 60 FPS beeinflussen '+key);
 assert.ok(Math.abs(a60[key]-a120[key])<1e-8,'60 und 120 FPS beeinflussen '+key);
}
assert.throws(()=>stepVehicle(base(),{},tuning,1),RangeError);
console.log('RC-Fahrphysik: 120 Hz, Lenkrichtung, Handbremse, Bremsen, FPS-Unabhaengigkeit OK.');
