import {createLocalServer,readJson,sendJson,sendFile} from '../lib/local-server.mjs';
import {acceptWebSocket} from '../lib/ws.mjs';
import {call} from '../lib/obs.mjs';
import {setupOBS,sourceName} from './setup-obs.mjs';
const port=4791,web=new URL('./web/',import.meta.url);
const files={'/':'index.html','/app.mjs':'app.mjs','/dsp.mjs':'dsp.mjs','/processor.js':'processor.js'};
// Endless 48 kHz mono 16-bit WAV: OBS's media source reads this while the browser streams PCM in.
const wavHeader=Buffer.alloc(44);
wavHeader.write('RIFF');wavHeader.writeUInt32LE(0xffffffff,4);wavHeader.write('WAVEfmt ',8);wavHeader.writeUInt32LE(16,16);wavHeader.writeUInt16LE(1,20);wavHeader.writeUInt16LE(1,22);
wavHeader.writeUInt32LE(48000,24);wavHeader.writeUInt32LE(96000,28);wavHeader.writeUInt16LE(2,32);wavHeader.writeUInt16LE(16,34);wavHeader.write('data',36);wavHeader.writeUInt32LE(0xffffffff,40);
const listeners=new Set();let producer=null,lastAudio=0;
function broadcast(pcm){for(const res of listeners){if(res.writableLength>96000){res.destroy();listeners.delete(res);}else res.write(pcm);}}
createLocalServer({port,name:'Vocal Studio',
 async routes(req,res,path){
  if(req.method==='GET'&&files[path]){await sendFile(res,new URL(files[path],web));return true;}
  if(req.method==='GET'&&path==='/live.wav'){res.writeHead(200,{'Content-Type':'audio/wav','Connection':'close'});res.write(wavHeader);listeners.add(res);req.on('close',()=>listeners.delete(res));return true;}
  if(req.method==='GET'&&path==='/api/status'){sendJson(res,{streaming:!!producer,receiving:Date.now()-lastAudio<1500,listeners:listeners.size});return true;}
  if(req.method==='GET'&&path==='/api/obs'){sendJson(res,await call('GetMediaInputStatus',{inputName:sourceName}));return true;}
  if(req.method==='POST'&&path==='/api/connect-obs'){
   const {deviceLabel,defaultLabel=''}=await readJson(req);
   if([deviceLabel,defaultLabel].some(v=>typeof v!=='string'||v.length>512))throw Error('Invalid mic');
   sendJson(res,await setupOBS(deviceLabel,defaultLabel));return true;
  }
  return false;
 },
 upgrade(req,socket,head,path){
  if(path!=='/api/audio'){socket.destroy();return;}
  producer?.close();
  const connection=acceptWebSocket(req,socket,{maxPayload:65536,
   onMessage:data=>{if(typeof data==='string'||data.length%2)return;lastAudio=Date.now();broadcast(data);},
   onClose:()=>{if(producer===connection)producer=null;}});
  producer=connection;
 }});
