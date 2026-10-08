import {test} from 'node:test';
import assert from 'node:assert/strict';
import {facePoint,eyeSpan,aimDelta,aimGain,palmSize,openPalm,handReach,zoomFromReach,focusFrame,nextFov} from '../controller/tracking.mjs';
const frame={fov:60,aspect:2};
const face=(cx,cy,size,over={})=>{
 const lm=Array.from({length:478},()=>({x:cx,y:cy,z:0}));
 Object.assign(lm,{33:{x:cx-.2*size,y:cy-.1*size},263:{x:cx+.2*size,y:cy-.1*size},1:{x:cx,y:cy+.05*size},10:{x:cx,y:cy-.5*size},152:{x:cx,y:cy+.5*size},234:{x:cx-.4*size,y:cy},454:{x:cx+.4*size,y:cy}},over);
 return lm;
};
const hand=(x,size)=>{const h=Array.from({length:21},()=>({x,y:.5,z:0}));h[5]={x:x+size/2,y:.5-size,z:0};h[17]={x:x-size/2,y:.5-size,z:0};return h;};
// Palm toward the camera, fingers up: knuckles spread across, fingertips well above them.
const palm=(cx,cy,s,{fist=false,edge=false}={})=>{
 const h=Array.from({length:21},()=>({x:cx,y:cy,z:0}));h[0]={x:cx,y:cy+.5*s};
 [5,9,13,17].forEach((k,i)=>{const x=edge?cx:cx+(i-1.5)*.2*s;h[k]={x,y:cy-.1*s};h[k+3]={x,y:fist?cy:cy-.6*s};});
 return h;
};
const close=(a,b,eps=1e-9)=>Math.abs(a-b)<eps;

test('subject right of center yaws right, above headroom pitches up',()=>{
 const right=aimDelta([.8,.4],frame);assert(right.yaw>0);assert.equal(right.pitch,0);
 const up=aimDelta([.5,.1],frame);assert(up.pitch>0);assert.equal(up.yaw,0);
 const down=aimDelta([.2,.9],frame);assert(down.yaw<0);assert(down.pitch<0);
});
test('aim inside dead zone does nothing',()=>{
 assert.deepEqual(aimDelta([.51,.41],frame),{yaw:0,pitch:0});
});
test('yaw brings an off-center subject to center',()=>{
 const s=Math.tan(Math.PI/6),x=(.8-.5)*2*s*2;
 assert(close(aimDelta([.8,.4],frame).yaw,Math.atan(x)*180/Math.PI));
});
test('aim reacts faster near the edge',()=>{assert(aimGain([.5,.05])>aimGain([.5,.4]));});
test('face point blends the eyes and nose, falls back to the nose',()=>{
 const [x,y]=facePoint(face(.5,.4,.2));
 assert(close(x,.5)&&close(y,.38*.7+.41*.3));
 const noEyes=face(.5,.4,.2);delete noEyes[33];
 const [nx,ny]=facePoint(noEyes);assert(close(nx,.5)&&close(ny,.41));
 assert.equal(facePoint(undefined),null);
});
test('eye span measures in image-height units',()=>{assert(close(eyeSpan(face(.5,.4,.2),2),.16));assert.equal(eyeSpan(null,2),0);});
test('palm size grows with the hand',()=>{assert(palmSize(hand(.3,.1),2)>palmSize(hand(.3,.05),2));});
test('hand reach needs two hands and a face, and is invariant to zoom',()=>{
 assert.equal(handReach([hand(.3,.1)],face(.5,.4,.2),frame),null);
 assert.equal(handReach([hand(.7,.1),hand(.3,.1)],undefined,frame),null);
 const near=handReach([hand(.7,.1),hand(.3,.1)],face(.5,.4,.2),frame);
 const zoomed=handReach([hand(.7,.2),hand(.3,.2)],face(.5,.4,.4),frame);
 near.values.forEach((v,i)=>assert(close(v,zoomed.values[i])));
});
const reach=(l,r,kind='face')=>({kind,values:[l,r]});
test('two-hand push zooms out, pull zooms in',()=>{
 const base=reach(0,0);
 assert(zoomFromReach(base,reach(.4,.4)).step>0);
 assert(zoomFromReach(base,reach(-.4,-.4)).step<0);
 assert.equal(zoomFromReach(base,reach(.4,0)).step,0,'one hand');
 assert.equal(zoomFromReach(base,reach(.4,-.4)).step,0,'opposite directions');
 assert.equal(zoomFromReach(base,reach(.1,.1)).step,0,'dead zone');
 assert.equal(zoomFromReach(base,reach(5,5)).step,2,'capped');
});
test('held push stops zooming as the baseline catches up',()=>{
 let state={baseline:reach(0,0),step:0},total=0;
 for(let i=0;i<300;i++){state=zoomFromReach(state.baseline,reach(.4,.4));total+=state.step;}
 assert.equal(state.step,0);assert(total>0&&total<100);
});
test('lost hands or a new normalizer reset the baseline',()=>{
 assert.deepEqual(zoomFromReach(reach(0,0),null),{step:0,baseline:null,delta:null});
 assert.deepEqual(zoomFromReach(reach(0,0),reach(1,1,'view')).baseline,reach(1,1,'view'));
});
test('open palm faces the camera; a fist or edge-on hand does not',()=>{
 assert(openPalm(palm(.3,.4,.2),2));
 assert(!openPalm(palm(.3,.4,.2,{fist:true}),2));
 assert(!openPalm(palm(.3,.4,.2,{edge:true}),2));
});
test('open palms beside the face frame face and hands',()=>{
 const f=face(.5,.4,.2),focus=focusFrame(f,[palm(.65,.4,.2),palm(.35,.4,.2)],frame);
 assert(focus);
 assert(focus.box.x0<.29&&focus.box.x1>.71&&focus.box.y0<.28&&focus.box.y1>.5);
 assert(close(focus.point[0],.5)&&focus.point[1]>.35&&focus.point[1]<.45);
 const span=Math.max(focus.box.x1-focus.box.x0,focus.box.y1-focus.box.y0);
 assert(close(Math.tan(focus.fov*Math.PI/360),Math.tan(Math.PI/6)*span/.8),'box fills 80% on its tighter axis');
 assert(focus.fov<60,'empty room zooms in');
 assert(focusFrame(f,[palm(.65,.4,.2),palm(.35,.4,.2)],{...frame,fov:20}).fov<20,'scales with the current zoom');
});
test('palms beside the face need both sides, open hands, and face height',()=>{
 const f=face(.5,.4,.2);
 assert.equal(focusFrame(f,[palm(.35,.4,.2)],frame),null,'one hand');
 assert.equal(focusFrame(f,[palm(.25,.4,.2),palm(.4,.4,.2)],frame),null,'both on one side');
 assert.equal(focusFrame(f,[palm(.65,.4,.2),palm(.35,.4,.2,{fist:true})],frame),null,'fist');
 assert.equal(focusFrame(f,[palm(.65,.9,.2),palm(.35,.9,.2)],frame),null,'hands at the desk');
 assert.equal(focusFrame(undefined,[palm(.65,.4,.2),palm(.35,.4,.2)],frame),null,'no face');
});
test('after a focus, zoom eases back to the saved value',()=>{
 const saved=50,focus=focusFrame(face(.5,.4,.2),[palm(.65,.4,.2),palm(.35,.4,.2)],{...frame,fov:saved});
 let fov=focus.fov;assert(fov<saved);
 for(let i=0;i<60;i++)fov=nextFov(fov,{found:true,chosen:saved,lostFor:0});
 assert.equal(fov,saved);
});
test('lost subject widens the view, found subject returns to the chosen zoom',()=>{
 assert.equal(nextFov(30,{found:false,chosen:30,lostFor:100}),30);
 assert.equal(nextFov(30,{found:false,chosen:30,lostFor:800}),33);
 assert.equal(nextFov(100,{found:false,chosen:30,lostFor:5000}),100);
 assert(nextFov(80,{found:true,chosen:30,lostFor:0})<80);
 assert.equal(nextFov(30.05,{found:true,chosen:30,lostFor:0}),30);
});
