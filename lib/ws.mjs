// Minimal WebSocket server endpoint (RFC 6455) for local browser-to-server streams.
import {createHash} from 'node:crypto';
const GUID='258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

export function parseFrame(buf,maxPayload=1<<20){
 if(buf.length<2)return null;
 const fin=!!(buf[0]&0x80),opcode=buf[0]&0x0f,masked=!!(buf[1]&0x80);
 let length=buf[1]&0x7f,offset=2;
 if(length===126){if(buf.length<4)return null;length=buf.readUInt16BE(2);offset=4;}
 else if(length===127){if(buf.length<10)return null;const big=buf.readBigUInt64BE(2);if(big>BigInt(maxPayload))throw Error('Frame too large');length=Number(big);offset=10;}
 if(length>maxPayload)throw Error('Frame too large');
 if(!masked)throw Error('Client frames must be masked');
 if(buf.length<offset+4+length)return null;
 const mask=buf.subarray(offset,offset+4),payload=Buffer.from(buf.subarray(offset+4,offset+4+length));
 for(let i=0;i<length;i++)payload[i]^=mask[i&3];
 return {fin,opcode,payload,size:offset+4+length};
}
export function encodeFrame(opcode,payload=Buffer.alloc(0)){
 const head=payload.length<126?Buffer.from([0x80|opcode,payload.length]):Buffer.from([0x80|opcode,126,payload.length>>8,payload.length&255]);
 return Buffer.concat([head,payload]);
}
export function acceptWebSocket(req,socket,{onMessage=()=>{},onClose=()=>{},maxPayload}={}){
 const key=req.headers['sec-websocket-key'];
 if(req.headers.upgrade?.toLowerCase()!=='websocket'||!key){socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');return null;}
 socket.write(['HTTP/1.1 101 Switching Protocols','Upgrade: websocket','Connection: Upgrade',`Sec-WebSocket-Accept: ${createHash('sha1').update(key+GUID).digest('base64')}`,'',''].join('\r\n'));
 socket.setNoDelay(true);
 let buffer=Buffer.alloc(0),parts=[],kind=0,closed=false;
 const finish=()=>{if(closed)return;closed=true;onClose();};
 const connection={
  send(data){if(!closed)socket.write(encodeFrame(typeof data==='string'?1:2,Buffer.from(data)));},
  close(){if(!closed){socket.end(encodeFrame(8));finish();}},
 };
 socket.on('data',chunk=>{
  buffer=Buffer.concat([buffer,chunk]);
  try{
   for(let frame;(frame=parseFrame(buffer,maxPayload));){
    buffer=buffer.subarray(frame.size);
    if(frame.opcode===8){connection.close();return;}
    if(frame.opcode===9){socket.write(encodeFrame(10,frame.payload));continue;}
    if(frame.opcode===10)continue;
    if(frame.opcode!==0)kind=frame.opcode;
    parts.push(frame.payload);
    if(frame.fin){const data=Buffer.concat(parts);parts=[];onMessage(kind===1?data.toString('utf8'):data);}
   }
  }catch{socket.destroy();}
 });
 socket.on('close',finish);socket.on('error',()=>socket.destroy());
 return connection;
}
