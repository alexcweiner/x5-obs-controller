import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {call} from '../lib/obs.mjs';
const port=4785, base=`http://127.0.0.1:${port}`;
let target;
async function findTarget(){
 if(target)return target;
 const {inputs}=await call('GetInputList');
 for(const input of inputs){const {filters}=await call('GetSourceFilterList',{sourceName:input.inputName});const f=filters.find(f=>f.filterKind==='shader_filter'&&String(f.filterSettings.shader_file_name).endsWith('insta360-x5-flat-view.shader'));if(f){target={sourceName:input.inputName,filterName:f.filterName};return target;}}
 throw Error('X5 view shader not found in OBS. Load insta360-x5-flat-view.shader on the X5 source.');
}
const limits={Yaw:[-180,180,0],Pitch:[-180,180,0],Roll:[-180,180,0],Field_Of_View:[40,130,95]};
async function state(){const t=await findTarget();const f=await call('GetSourceFilter',t);return {...t,enabled:f.filterEnabled,view:Object.fromEntries(Object.entries(limits).map(([k,v])=>[k,f.filterSettings[k]??v[2]]))};}
const server=http.createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 try{
  if(req.headers.host!==`127.0.0.1:${port}`&&req.headers.host!==`localhost:${port}`){res.writeHead(403);return res.end();}
  if(req.headers.origin&&!['http://localhost:'+port,base].includes(req.headers.origin)){res.writeHead(403);return res.end();}
  const path=new URL(req.url,base).pathname;
  if(req.method==='GET'&&path==='/'){res.setHeader('Content-Type','text/html');return res.end(await readFile(new URL('./index.html',import.meta.url)));}
  if(req.method==='GET'&&path==='/api/state'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(await state()));}
  if(req.method==='GET'&&path==='/api/health'){
   const s=await state(),{inputSettings:c}=await call('GetInputSettings',{inputName:s.sourceName});
   const format=Buffer.from(c.supported_format||'','base64').toString('utf8');
   let present=false,deviceCheck='Device availability could not be verified';
   try{const {propertyItems}=await call('GetInputPropertiesListPropertyItems',{inputName:s.sourceName,propertyName:'device'});present=propertyItems.some(p=>p.itemValue===c.device&&p.itemEnabled);deviceCheck=present?'Camera available':'Camera disconnected or unavailable';}catch{}
   const fps=c.frame_rate?.numerator/c.frame_rate?.denominator;
   const mode=!c.use_preset&&format.startsWith('2880x1440 ')&&Math.abs(fps-30)<0.1;
   res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({ok:present&&mode&&s.enabled,details:[deviceCheck,mode?'2880×1440 at 30 FPS configured':'Wrong capture mode: disable Use Preset; select 2880×1440 at 30 FPS',s.enabled?'View filter enabled':'View filter disabled','Source: '+s.sourceName,'Checks device availability and settings, not live frame freshness.']}));
  }
  if(req.method==='GET'&&path==='/api/preview'){
   const t=await findTarget();const {imageData}=await call('GetSourceScreenshot',{sourceName:t.sourceName,imageFormat:'jpg',imageWidth:960,imageCompressionQuality:75});
   res.setHeader('Content-Type','image/jpeg');return res.end(Buffer.from(imageData.split(',')[1],'base64'));
  }
  if(req.method==='POST'&&path==='/api/view'){
   if(req.headers['content-type']!=='application/json')throw Error('Expected JSON');
   let body='';for await(const chunk of req){body+=chunk;if(body.length>2048)throw Error('Request too large');}
   const input=JSON.parse(body),filterSettings={};
   for(const [k,v]of Object.entries(input)){if(!limits[k]||typeof v!=='number'||!Number.isFinite(v))throw Error('Invalid view setting');filterSettings[k]=k==='Field_Of_View'?Math.max(40,Math.min(130,v)):((v+180)%360+360)%360-180;}
   await call('SetSourceFilterSettings',{...await findTarget(),filterSettings,overlay:true});
   res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(await state()));
  }
  res.writeHead(404);res.end();
 }catch(e){res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:e.message}));}
});
server.listen(port,'127.0.0.1',()=>console.log(`X5 controller: ${base}`));
