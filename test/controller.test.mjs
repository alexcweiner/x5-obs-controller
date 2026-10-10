import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../controller/index.html',import.meta.url),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
test('frontend JavaScript parses',()=>{new vm.Script(script);});
const c=vm.createContext({});
for(const name of ['multiply','axisQuat','orientation','matrix','angles','slerp','angularDelta','uprightRoll','levelAim'])vm.runInContext(script.split('\n').find(l=>l.startsWith('function '+name+'(')),c);
vm.runInContext(script.match(/^function snapCube\([\s\S]*?\n\}$/m)[0],c);
test('quaternion orientation survives Euler transport, including poles',()=>{
 for(const pitch of [-180,-90,-89,0,89,90,179])for(const yaw of [-179,0,72,179]){
  const q=c.orientation({Yaw:yaw,Pitch:pitch,Roll:123});const a=c.matrix(q),b=c.matrix(c.orientation(c.angles(q)));
  assert(a.every((v,i)=>Math.abs(v-b[i])<1e-6));
 }
});
test('glide takes short path across wrap boundary',()=>{
 const a=c.orientation({Yaw:179,Pitch:0,Roll:0}),b=c.orientation({Yaw:-179,Pitch:0,Roll:0});
 assert(Math.abs(Math.abs(c.angles(c.slerp(a,b,.5)).Yaw)-180)<1e-6);
 for(let t=0;t<=1;t+=.1)assert(Math.abs(Math.hypot(...c.slerp(a,b,t))-1)<1e-6);
});
test('cube turns land the front face upright',()=>{
 const quarter=Math.PI/2,turn=(q,axis,sign)=>c.multiply(c.axisQuat(axis,sign*quarter),q),near=(a,b)=>Math.abs(a-b)<1e-9;
 const start=[0,0,0,1],X=[1,0,0],Y=[0,1,0];
 let r=c.uprightRoll(start);assert.equal(r.face,0);assert(near(r.roll,0));
 const top=turn(start,X,1);r=c.uprightRoll(top);assert.equal(r.face,4);assert(near(r.roll,0));
 r=c.uprightRoll(turn(top,X,1));assert.equal(r.face,2);assert(near(Math.abs(r.roll),Math.PI));
 r=c.uprightRoll(turn(top,Y,-1));assert.equal(r.face,1);assert(near(r.roll,-quarter));
 r=c.uprightRoll(turn(start,Y,1));assert.equal(r.face,3);assert(near(r.roll,0));
 let q=start;for(const [axis,sign]of [[X,1],[Y,-1],[X,-1],[Y,1],[X,1],[X,1],[Y,1]]){q=turn(q,axis,sign);const u=c.uprightRoll(q);q=c.multiply(c.axisQuat([0,0,1],u.roll),q);assert(near(c.uprightRoll(q).roll,0));}
});
test('a dragged cube snaps to the face most toward you, upright',()=>{
 const quarter=Math.PI/2,X=[1,0,0],Y=[0,1,0],same=(a,b)=>Math.abs(Math.abs(a.reduce((s,v,i)=>s+v*b[i],0))-1)<1e-9;
 let r=c.snapCube(c.multiply(c.axisQuat([.6,.8,0],.5),[0,0,0,1]));assert.equal(r.face,0);assert(same(r.to,[0,0,0,1]));
 const past=c.multiply(c.axisQuat(X,quarter*.7),[0,0,0,1]);r=c.snapCube(past);assert.equal(r.face,4);assert(same(r.to,c.axisQuat(X,quarter)));
 for(let i=0;i<40;i++){
  const q=c.multiply(c.axisQuat([Math.sin(i),Math.cos(i*1.3),Math.sin(i*.7)].map((v,_,a)=>v/Math.hypot(...a)),i*.37),[0,0,0,1]);r=c.snapCube(q);
  assert.equal(r.face,c.uprightRoll(q).face);assert.equal(c.uprightRoll(r.to).face,r.face);assert(Math.abs(c.uprightRoll(r.to).roll)<1e-9);
  const m=c.matrix(r.to);assert(m.every(v=>Math.abs(v)<1e-9||Math.abs(Math.abs(v)-1)<1e-9),'lands square');
 }
});
test('follow aim keeps the horizon while pointing where local turns point',()=>{
 const forward=v=>{const m=c.matrix(c.orientation(v));return [m[2],m[5],m[8]];};
 let v={Yaw:30,Pitch:20,Roll:10};
 for(let i=0;i<200;i++){
  const yaw=Math.sin(i*1.7)*.05,pitch=Math.cos(i*1.3)*.04,raw=c.angles(c.multiply(c.orientation(v),c.multiply(c.axisQuat([0,1,0],yaw),c.axisQuat([1,0,0],pitch)))),next=c.levelAim(v,yaw,pitch);
  forward(next).forEach((x,j)=>assert(Math.abs(x-forward(raw)[j])<1e-9));
  assert(Math.abs(next.Roll-10)<1e-9);v=next;
 }
});
test('knob wraps both directions',()=>{assert.equal(c.angularDelta(-179,179),2);assert.equal(c.angularDelta(179,-179),-2);});
vm.runInContext(readFileSync(new URL('../lib/web/remote-shell.js',import.meta.url),'utf8'),c);
test('popout fits content and preserves position when there is room',()=>{
 const b=c.popoutBounds(90,0,30,{availWidth:1440,availHeight:900},100,150);
 assert.equal(b.height,120);assert.equal(b.x,100);assert.equal(b.y,150);
});
test('popout caps size and keeps expanded window on available screen',()=>{
 const b=c.popoutBounds(1200,0,30,{availWidth:800,availHeight:600},750,550);
 assert.equal(b.height,600);assert.equal(b.x,480);assert.equal(b.y,0);
 const second=c.popoutBounds(300,0,30,{availWidth:800,availHeight:600,availLeft:-800,availTop:20},-700,40);
 assert.equal(second.x,-700);assert.equal(second.y,40);
});
