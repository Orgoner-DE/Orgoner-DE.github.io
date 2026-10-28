// DRIVE QUER 7.9: deterministic, RC-inspired planar vehicle simulation.
// All calculations operate on numerical state only; no browser or graphics dependency.
// Units: metres, seconds, radians. Steering input is +left / -right.
export const PHYSICS_DT = 1 / 120;
const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));
export function stepVehicle(car, input, cfg, dt=PHYSICS_DT) {
  if(!(dt>0&&dt<=.05)) throw new RangeError('Unzulässiger Zeitschritt');
  const wheelbase=clamp(cfg.wheelbase||.25,.18,.4);
  const grip=clamp((cfg.grip??56)/100,.2,1);
  const gyro=clamp((cfg.gyro??54)/100,0,1);
  const maxSteer=clamp(cfg.steering??48,20,65)*Math.PI/180;
  const power=clamp(cfg.power??7,2,10);
  const hand=Boolean(input.handbrake);
  const steeringTarget=(input.left?1:0)-(input.right?1:0);
  car.steer+= (steeringTarget-car.steer)*(1-Math.exp(-dt*11));
  const sx=Math.sin(car.yaw),sz=Math.cos(car.yaw),rx=Math.cos(car.y),rz=-Math.sin(car.yaw);
  let forward=car.vx*sx+car.vz*sz;
  let lateral=car.vx*rx+car.vz*rz;
  const throttle=Boolean(input.throttle),brake=Boolean(input.brake);
  const drive=throttle?(3.2+power*.50)*(hand?.42:1):0;
  const rolling=forward*(.36+.11*Math.abs(forward));
  const decel=brake?Math.sign(forward)*10:0;
  forward=clamp(forward+(drive-rolling-decel)*dt,-1.5,8);
  if(Math.abs(forward)<.006&&!throttle)forward=0;
  // RC drifting: limited yaw response, rear tire breakaway and gyro damping.
  // Steering angle is geometrically limited, but rates are tuned for a miniature chassis.
  const turnRadiusRate=-Math.tan(car.steer*maxSteer)*forward/wheelbase;
  const targetYawRate=clamp(turnRadiusRate*(.18+(1-grip)*.08)*(hand?1.17:1),-4.5,4.5);
  const yawResponse=(2.4+gyro*5)*(hand?.62:1);
  car.yawRate+=(targetYawRate-car.yawRate)*(1-Math.exp(-dt*yawResponse));
  if(!Number.isFinite(car.yawRate)) throw new Error('Ungueltige Gierrate');
  // Slip follows yaw rotation. Tire lateral force relaxes it over time.
  lateral-=car.yawRate*forward*dt;
  let lateralGrip=(2.1+grip*8.5)*(hand?.17:1);
  if(throttle&&Math.abs(car.steer)>.15&&forward>2.3)lateralGrip*=.70;
  lateral*=Math.exp(-dt*lateralGrip);
  car.yaw+=car.yawRate*dt;
  const sn=Math.sin(car.yaw),cs=Math.cos(car.yaw);
  car.vx=sn*forward+cs*lateral;
  car.vz=cs*forward-sn*lateral;
  car.x+=car.vx*dt;
  car.z+=car.vz*dt;
  if(![car.x,car.z,car.yaw,car.vx,car.vz].every(Number.isFinite)){
    throw new Error('Nichtendlicher Zustand in der Fahrphysik');
  }
  const angle=Math.atan2(lateral,Math.max(.2,Math.abs(forward)))*180/Math.PI;
  return {forward,lateral,speed:Math.hypot(car.vx,car.vz),driftAngle:angle,yawRate:car.yawRate};
}
