import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createUISync} from '../lib/ui-sync.mjs';
function response(){const r=new EventEmitter();r.messages=[];r.writeHead=r.setHeader=()=>{};r.write=s=>r.messages.push(JSON.parse(s.slice(6)));r.end=s=>r.result=JSON.parse(s);return r;}
test('layout broadcasts across clients, initializes once and resyncs on reconnect',async()=>{
 const handle=createUISync(),a=response(),b=response();
 const subscribe=r=>handle({method:'GET'},r,'/api/ui/events');
 const post=async input=>{const req={method:'POST',headers:{'content-type':'application/json'},async *[Symbol.asyncIterator](){yield JSON.stringify(input);}};const r=response();await handle(req,r,'/api/ui');return r.result;};
 try{
  await subscribe(a);await subscribe(b);assert.equal(a.messages.at(-1).compact,null);
  await post({compact:true,initialize:true});assert.equal(a.messages.at(-1).compact,true);assert.equal(b.messages.at(-1).compact,true);
  assert.equal((await post({compact:false,initialize:true})).compact,true);
  await post({compact:false});assert.equal(a.messages.at(-1).compact,false);assert.equal(b.messages.at(-1).compact,false);
  b.emit('close');await post({compact:true});await subscribe(b);assert.equal(b.messages.at(-1).compact,true);
  await assert.rejects(post({compact:'false'}),/Invalid compact/);
 }finally{a.emit('close');b.emit('close');}
});
