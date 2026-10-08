// Loopback-only HTTP server shared by the remotes: Host/Origin checks, no-store
// responses, JSON errors, layout sync, and the shared browser files under /shared/.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {createUISync} from './ui-sync.mjs';
const sharedDir=new URL('./web/',import.meta.url);
const types={html:'text/html',js:'text/javascript',mjs:'text/javascript',css:'text/css',json:'application/json',wasm:'application/wasm',task:'application/octet-stream',jpg:'image/jpeg'};
export async function readJson(req,limit=2048){
 if(req.headers['content-type']!=='application/json')throw Error('Expected JSON');
 let body='';for await(const chunk of req){body+=chunk;if(body.length>limit)throw Error('Request too large');}
 return JSON.parse(body);
}
export function sendJson(res,value){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));}
export async function sendFile(res,url,{cache=false}={}){
 let file;try{file=await readFile(url);}catch{res.writeHead(404);return res.end();}
 res.setHeader('Content-Type',types[url.pathname.split('.').pop()]||'application/octet-stream');
 if(cache)res.setHeader('Cache-Control','max-age=86400');
 res.end(file);
}
export function isLocal(req,port){
 const hosts=[`127.0.0.1:${port}`,`localhost:${port}`];
 return hosts.includes(req.headers.host)&&(!req.headers.origin||hosts.some(h=>req.headers.origin==='http://'+h));
}
export function createLocalServer({port,name,routes,upgrade}){
 const base=`http://127.0.0.1:${port}`,handleUISync=createUISync();
 const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  try{
   if(!isLocal(req,port)){res.writeHead(403);return res.end();}
   const url=new URL(req.url,base),path=url.pathname;
   if(await handleUISync(req,res,path))return;
   const shared=/^\/shared\/([\w-]+\.(?:js|css))$/.exec(path);
   if(req.method==='GET'&&shared)return await sendFile(res,new URL(shared[1],sharedDir));
   if(await routes(req,res,path,url))return;
   res.writeHead(404);res.end();
  }catch(e){if(!res.headersSent)res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:e.message}));}
 });
 if(upgrade)server.on('upgrade',(req,socket,head)=>{if(!isLocal(req,port)){socket.destroy();return;}upgrade(req,socket,head,new URL(req.url,base).pathname);});
 server.listen(port,'127.0.0.1',()=>console.log(`${name}: ${base}`));
 return server;
}
