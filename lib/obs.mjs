import {readFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {createHash,randomUUID} from 'node:crypto';
let ws,ready=false,connecting;
const pending=new Map();
const hash=s=>createHash('sha256').update(s).digest('base64');
async function connect(){
 if(ready)return;
 if(connecting)return connecting;
 connecting=new Promise(async(resolve,reject)=>{
  let timer;
  try{
   const config=JSON.parse(await readFile(`${homedir()}/Library/Application Support/obs-studio/plugin_config/obs-websocket/config.json`,'utf8'));
   if(!config.server_enabled)throw Error('In OBS: Tools → WebSocket Server Settings → Enable WebSocket server → Apply. Keep authentication enabled.');
   ws=new WebSocket(`ws://127.0.0.1:${config.server_port||4455}`);
   timer=setTimeout(()=>{ws.close();reject(Error('OBS connection timed out'));},5000);
   ws.onmessage=({data})=>{
    const {op,d}=JSON.parse(data);
    if(op===0){const a=d.authentication;ws.send(JSON.stringify({op:1,d:{rpcVersion:1,eventSubscriptions:0,...(a?{authentication:hash(hash(config.server_password+a.salt)+a.challenge)}:{})}}));}
    if(op===2){clearTimeout(timer);ready=true;resolve();}
    if(op===7){const p=pending.get(d.requestId);if(p){clearTimeout(p.timer);pending.delete(d.requestId);d.requestStatus.result?p.resolve(d.responseData||{}):p.reject(Error(d.requestStatus.comment||'OBS request failed'));}}
   };
   ws.onerror=()=>reject(Error('Cannot connect to OBS. Check WebSocket server settings.'));
   ws.onclose=()=>{clearTimeout(timer);ready=false;reject(Error('OBS disconnected'));for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('OBS disconnected'));}pending.clear();};
  }catch(e){clearTimeout(timer);reject(e);}
 }).finally(()=>{connecting=null;});
 return connecting;
}
export async function call(requestType,requestData={}){
 await connect();const requestId=randomUUID();
 return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(requestId);reject(Error('OBS request timed out'));},6000);pending.set(requestId,{resolve,reject,timer});ws.send(JSON.stringify({op:6,d:{requestType,requestId,requestData}}));});
}

export function close(){ws?.close();}
