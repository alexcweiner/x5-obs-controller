import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {presets,families,controls,chain} from '../vocal/web/dsp.mjs';
import {sameMic} from '../vocal/setup-obs.mjs';
import {parseFrame,encodeFrame,acceptWebSocket} from '../lib/ws.mjs';
import {createLocalServer} from '../lib/local-server.mjs';

test('every preset has a family and stays inside the control ranges',()=>{
 const ids=new Set(families.map(([id])=>id));
 for(const p of presets){assert(ids.has(p.family));for(const [key,,min,max]of controls)assert(p[key]>=min&&p[key]<=max,`${p.id} ${key}`);}
});
test('AirPods chain uses a higher rumble cut, lower presence band and softer highs',()=>{
 const dji=chain(presets[0]),airpods=chain(presets.find(p=>p.family==='AirPods'));
 assert.equal(dji.highpass,80);assert.equal(airpods.highpass,100);
 assert(airpods.presence.frequency<dji.presence.frequency);assert(airpods.air.gain<dji.air.gain);
});
test('more compression lowers the threshold and raises the ratio',()=>{
 const light=chain({...presets[0],compression:.1}),heavy=chain({...presets[0],compression:.9});
 assert(heavy.compressor.threshold<light.compressor.threshold);assert(heavy.compressor.ratio>light.compressor.ratio);
 assert.equal(chain({...presets[0],gain:0}).makeup,1);
});
test('Chrome mic labels match OBS device names',()=>{
 assert(sameMic('DJI MIC MINI','DJI MIC MINI (2ca3:4011)'));
 assert(sameMic('AirPods Pro','Default - AirPods Pro'));
 assert(sameMic('DJI Mic Mini-4CB7BF','DJI Mic Mini-4CB7BF (Bluetooth)'));
 assert(!sameMic('MacBook Pro Microphone','DJI MIC MINI'));
 assert(!sameMic('',''));
});
const masked=(opcode,payload,fin=true)=>{const mask=Buffer.from([1,2,3,4]),body=Buffer.from(payload).map((b,i)=>b^mask[i&3]);return Buffer.concat([Buffer.from([(fin?0x80:0)|opcode,0x80|body.length]),mask,body]);};
test('WebSocket frames unmask, wait for more data, and reject bad frames',()=>{
 const frame=masked(2,[9,8,7]);
 assert.deepEqual([...parseFrame(frame).payload],[9,8,7]);
 assert.equal(parseFrame(frame.subarray(0,5)),null);
 assert.throws(()=>parseFrame(encodeFrame(2,Buffer.from([1]))),/masked/);
 assert.throws(()=>parseFrame(masked(2,new Array(100).fill(0)),10),/too large/);
});
test('shared local server accepts a WebSocket and echoes binary audio',async()=>{
 const port=47911;
 const server=createLocalServer({port,name:'test',routes:async()=>false,upgrade(req,socket){const ws=acceptWebSocket(req,socket,{onMessage:data=>ws.send(data)});}});
 await new Promise(r=>server.once('listening',r));
 try{
  const ws=new WebSocket(`ws://127.0.0.1:${port}/api/audio`);ws.binaryType='arraybuffer';
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  const reply=new Promise(r=>{ws.onmessage=({data})=>r([...new Uint8Array(data)]);});
  ws.send(new Uint8Array(300).fill(7));
  const bytes=await reply;assert.equal(bytes.length,300);assert(bytes.every(b=>b===7));
  ws.close();
  const forbidden=await fetch(`http://127.0.0.1:${port}/`,{headers:{origin:'http://evil.example'}});assert.equal(forbidden.status,403);
 }finally{server.close();server.closeAllConnections();}
});
test('vocal frontend files parse',()=>{
 for(const f of ['../vocal/web/app.mjs','../vocal/web/dsp.mjs','../vocal/web/processor.js','../lib/web/remote-shell.js'])execFileSync(process.execPath,['--check',fileURLToPath(new URL(f,import.meta.url))]);
});
