import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../controller/index.html',import.meta.url),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
test('frontend JavaScript parses',()=>{new vm.Script(script);});
const c=vm.createContext({});
for(const name of ['multiply','axisQuat','orientation','matrix','angles','slerp','angularDelta'])vm.runInContext(script.split('\n').find(l=>l.startsWith('function '+name+'(')),c);
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
test('knob wraps both directions',()=>{assert.equal(c.angularDelta(-179,179),2);assert.equal(c.angularDelta(179,-179),-2);});
vm.runInContext(script.split('\n').find(l=>l.startsWith('function popoutBounds(')),c);
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
