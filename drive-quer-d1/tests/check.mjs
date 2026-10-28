import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
const dir=path.resolve(import.meta.dirname,'..');
const js=fs.readFileSync(path.join(dir,'game.js'),'utf8');
const html=fs.readFileSync(path.join(dir,'index.html'),'utf8');
new vm.Script(js.replace(/^import \* as THREE from [^\n]+\n/,''));
const matches=js.match(/const models=\[([\s\S]*?)\];/);
assert.ok(matches,'Fahrzeugkatalog fehlt');
const cars=vm.runInNewContext('['+matches[1]+']');
assert.equal(cars.length,28,'28 Fahrzeuge erwartet');
const trackSection=js.match(/const TRACKS=\[([\s\S]*?)\];/);
assert.ok(trackSection,'Streckenkatalog fehlt');
const tracks=vm.runInNewContext('['+trackSection[1]+']');
assert.equal(tracks.length,3,'3 Strecken erwartet');
for(const id of ['render','vehicle','steering','grip','gyro','tracks','modes','quality','togglePanel','camera','reset','status']){
  assert.ok(html.includes('id="'+id+'"'),'UI-Element fehlt: '+id);
}
for(const mode of ['free','qual','tandem'])assert.ok(js.includes("['"+mode+"'"),'Modus fehlt: '+mode);
for(const control of ['left','right','throttle','brake','handbrake'])assert.ok(html.includes('data-control="'+control+'"'),'Steuerung fehlt: '+control);
assert.ok(js.includes("../vendor/three.module.js"),'Lokales Three.js fehlt');
console.log('DRIVE QUER: JS-Syntax OK, '+cars.length+' Fahrzeuge, '+tracks.length+' Strecken, Eingaben und UI OK.');
