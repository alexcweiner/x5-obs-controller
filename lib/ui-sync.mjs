// One shared layout state, independent of OBS and browser storage partitions.
export function createUISync(){
 let compact=null;
 const clients=new Set();
 const snapshot=()=>({compact});
 const send=res=>res.write(`data: ${JSON.stringify(snapshot())}\n\n`);
 return async function handle(req,res,path){
  if(path==='/api/ui/events'&&req.method==='GET'){
   res.writeHead(200,{'Content-Type':'text/event-stream','Connection':'keep-alive'});
   clients.add(res);send(res);
   const heartbeat=setInterval(()=>res.write(': keepalive\n\n'),15000);
   res.on('close',()=>{clearInterval(heartbeat);clients.delete(res);});
   return true;
  }
  if(path!=='/api/ui'||req.method!=='POST')return false;
  if(req.headers['content-type']!=='application/json')throw Error('Expected JSON');
  let body='';for await(const chunk of req){body+=chunk;if(body.length>2048)throw Error('Request too large');}
  const input=JSON.parse(body);
  if(typeof input.compact!=='boolean')throw Error('Invalid compact state');
  // A newly opened page may seed an empty server, but never override live state.
  if(!input.initialize||compact===null){compact=input.compact;for(const client of clients)send(client);}
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify(snapshot()));
  return true;
 };
}
