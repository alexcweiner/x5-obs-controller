import {test} from 'node:test';
import assert from 'node:assert/strict';
import {headCrop,fromCrop,headFromFace,headFromPose,aimDelta,aimGain,palmSize,openPalm,handReach,zoomFromReach,focusFrame,nextFov} from '../controller/tracking.mjs';
const frame={fov:60,aspect:2};
const face=(cx,cy,size,over={})=>{
 const lm=Array.from({length:478},()=>({x:cx,y:cy,z:0}));
 Object.assign(lm,{33:{x:cx-.2*size,y:cy-.1*size},263:{x:cx+.2*size,y:cy-.1*size},1:{x:cx,y:cy+.05*size},13:{x:cx,y:cy+.15*size},14:{x:cx,y:cy+.19*size},10:{x:cx,y:cy-.5*size},152:{x:cx,y:cy+.5*size},234:{x:cx-.4*size,y:cy},454:{x:cx+.4*size,y:cy}},over);
 return lm;
};
const head=(cx,cy,size)=>headFromFace(face(cx,cy,size),frame.aspect);
// Pose head points: nose 0, eyes 1-6, ears 7-8, mouth 9-10. `turn` squeezes them sideways like a head in profile.
const pose=(cx,cy,size,{turn=1,visibility=1}={})=>{
 const at=(dx,dy)=>({x:cx+dx*size*turn/frame.aspect,y:cy+dy*size,z:0,visibility});
 return [at(0,.05),at(-.15,-.1),at(-.2,-.1),at(-.25,-.1),at(.15,-.1),at(.2,-.1),at(.25,-.1),at(-.4,0),at(.4,0),at(-.1,.17),at(.1,.17),...Array.from({length:22},()=>at(0,1))];
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
test('face head aims between the eyes and nose, falls back to the nose',()=>{
 const h=head(.5,.4,.2);
 assert(close(h.point[0],.5)&&close(h.point[1],.38*.7+.41*.3));
 assert.equal(h.source,'face');assert(close(h.scale,.27*.2));
 const noEyes=face(.5,.4,.2);delete noEyes[33];
 const [nx,ny]=headFromFace(noEyes,2).point;assert(close(nx,.5)&&close(ny,.41));
 assert.equal(headFromFace(undefined,2),null);
});
test('pose head is the fallback and keeps its scale when the head turns sideways',()=>{
 const front=headFromPose(pose(.5,.4,.2),2),side=headFromPose(pose(.5,.4,.2,{turn:.3}),2);
 assert.equal(front.source,'pose');
 assert(close(front.point[0],.5));
 assert(close(front.scale,side.scale),'eye-to-mouth ignores turning');
 assert(front.box.y0<front.point[1]&&front.box.y1>front.point[1]&&front.box.x0<.5&&front.box.x1>.5);
 assert.equal(headFromPose(pose(.5,.4,.2,{visibility:.1}),2),null);
 assert.equal(headFromPose(undefined,2),null);
});
test('head crop is a square around the head that maps back to the frame',()=>{
 const size={width:960,height:480},crop=headCrop(pose(.5,.4,.2),size);
 assert(crop.size>=48);
 assert(crop.x<480&&crop.x+crop.size>480&&crop.y<192&&crop.y+crop.size>192,'contains the head');
 assert(headCrop(pose(.5,.4,.2,{turn:.3}),size).size>.5*crop.size,'a turned head still gets a big crop');
 const [p]=fromCrop([{x:.5,y:.5,z:0}],crop,size);
 assert(close(p.x,(crop.x+crop.size/2)/960)&&close(p.y,(crop.y+crop.size/2)/480));
 assert.equal(headCrop(undefined,size),null);
});
test('palm size grows with the hand',()=>{assert(palmSize(hand(.3,.1),2)>palmSize(hand(.3,.05),2));});
test('hand reach needs two hands and a head, and is invariant to zoom',()=>{
 assert.equal(handReach([hand(.3,.1)],head(.5,.4,.2),frame),null);
 assert.equal(handReach([hand(.7,.1),hand(.3,.1)],null,frame),null);
 const near=handReach([hand(.7,.1),hand(.3,.1)],head(.5,.4,.2),frame);
 const zoomed=handReach([hand(.7,.2),hand(.3,.2)],head(.5,.4,.4),frame);
 near.values.forEach((v,i)=>assert(close(v,zoomed.values[i])));
 assert.equal(handReach([hand(.7,.1),hand(.3,.1)],headFromPose(pose(.5,.4,.2),2),frame).kind,'pose','switching source resets the baseline');
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
 const f=head(.5,.4,.2),focus=focusFrame(f,[palm(.65,.4,.2),palm(.35,.4,.2)],frame);
 assert(focus);
 assert(focus.box.x0<.29&&focus.box.x1>.71&&focus.box.y0<.28&&focus.box.y1>.5);
 assert(close(focus.point[0],.5)&&focus.point[1]>.35&&focus.point[1]<.45);
 const span=Math.max(focus.box.x1-focus.box.x0,focus.box.y1-focus.box.y0);
 assert(close(Math.tan(focus.fov*Math.PI/360),Math.tan(Math.PI/6)*span/.8),'box fills 80% on its tighter axis');
 assert(focus.fov<60,'empty room zooms in');
 assert(focusFrame(f,[palm(.65,.4,.2),palm(.35,.4,.2)],{...frame,fov:20}).fov<20,'scales with the current zoom');
});
test('palms beside the face need both sides, open hands, and face height',()=>{
 const f=head(.5,.4,.2);
 assert.equal(focusFrame(f,[palm(.35,.4,.2)],frame),null,'one hand');
 assert.equal(focusFrame(f,[palm(.25,.4,.2),palm(.4,.4,.2)],frame),null,'both on one side');
 assert.equal(focusFrame(f,[palm(.65,.4,.2),palm(.35,.4,.2,{fist:true})],frame),null,'fist');
 assert.equal(focusFrame(f,[palm(.65,.9,.2),palm(.35,.9,.2)],frame),null,'hands at the desk');
 assert.equal(focusFrame(null,[palm(.65,.4,.2),palm(.35,.4,.2)],frame),null,'no head');
 assert(focusFrame(headFromPose(pose(.5,.4,.2),2),[palm(.65,.4,.2),palm(.35,.4,.2)],frame),'works from the pose fallback');
});
test('after a focus, zoom eases back to the saved value',()=>{
 const saved=50,focus=focusFrame(head(.5,.4,.2),[palm(.65,.4,.2),palm(.35,.4,.2)],{...frame,fov:saved});
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
