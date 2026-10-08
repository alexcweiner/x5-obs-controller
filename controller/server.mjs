import {createLocalServer,readJson,sendJson,sendFile} from '../lib/local-server.mjs';
import {call} from '../lib/obs.mjs';
const port=4785;
let target;
async function findTarget(){
 if(target)return target;
 const {inputs}=await call('GetInputList');
 for(const input of inputs){const {filters}=await call('GetSourceFilterList',{sourceName:input.inputName});const f=filters.find(f=>f.filterKind==='shader_filter'&&String(f.filterSettings.shader_file_name).endsWith('insta360-x5-flat-view.shader'));if(f){target={sourceName:input.inputName,filterName:f.filterName};return target;}}
 throw Error('X5 view shader not found in OBS. Load insta360-x5-flat-view.shader on the X5 source.');
}
const limits={Yaw:[-180,180,0],Pitch:[-180,180,0],Roll:[-180,180,0],Field_Of_View:[10,130,95]};
async function state(){const t=await findTarget();const f=await call('GetSourceFilter',t);return {...t,enabled:f.filterEnabled,view:Object.fromEntries(Object.entries(limits).map(([k,v])=>[k,f.filterSettings[k]??v[2]]))};}
createLocalServer({port,name:'X5 controller',async routes(req,res,path,url){
 if(req.method==='GET'&&path==='/'){await sendFile(res,new URL('./index.html',import.meta.url));return true;}
 if(req.method==='GET'&&path==='/tracking.mjs'){await sendFile(res,new URL('./tracking.mjs',import.meta.url));return true;}
 const asset=/^\/vendor\/mediapipe\/((?:wasm\/)?[\w-]+\.(?:mjs|js|wasm|task))$/.exec(path);
 if(req.method==='GET'&&asset){await sendFile(res,new URL('./vendor/mediapipe/'+asset[1],import.meta.url),{cache:true});return true;}
 if(req.method==='GET'&&path==='/api/state'){sendJson(res,await state());return true;}
 if(req.method==='GET'&&path==='/api/health'){
  const s=await state(),{inputSettings:c}=await call('GetInputSettings',{inputName:s.sourceName});
  const format=Buffer.from(c.supported_format||'','base64').toString('utf8');
  let present=false,deviceCheck='Device availability could not be verified';
  try{const {propertyItems}=await call('GetInputPropertiesListPropertyItems',{inputName:s.sourceName,propertyName:'device'});present=propertyItems.some(p=>p.itemValue===c.device&&p.itemEnabled);deviceCheck=present?'Camera available':'Camera disconnected or unavailable';}catch{}
  const fps=c.frame_rate?.numerator/c.frame_rate?.denominator;
  const mode=!c.use_preset&&format.startsWith('2880x1440 ')&&Math.abs(fps-30)<0.1;
  sendJson(res,{ok:present&&mode&&s.enabled,details:[deviceCheck,mode?'2880×1440 at 30 FPS configured':'Wrong capture mode: disable Use Preset; select 2880×1440 at 30 FPS',s.enabled?'View filter enabled':'View filter disabled','Source: '+s.sourceName,'Checks device availability and settings, not live frame freshness.']});
  return true;
 }
 if(req.method==='GET'&&path==='/api/preview'){
  const width=Math.round(Math.max(160,Math.min(1920,Number(url.searchParams.get('width'))||960)));
  const t=await findTarget();const {imageData}=await call('GetSourceScreenshot',{sourceName:t.sourceName,imageFormat:'jpg',imageWidth:width,imageCompressionQuality:75});
  res.setHeader('Content-Type','image/jpeg');res.end(Buffer.from(imageData.split(',')[1],'base64'));return true;
 }
 if(req.method==='POST'&&path==='/api/view'){
  const input=await readJson(req),filterSettings={};
  for(const [k,v]of Object.entries(input)){if(!limits[k]||typeof v!=='number'||!Number.isFinite(v))throw Error('Invalid view setting');filterSettings[k]=k==='Field_Of_View'?Math.max(10,Math.min(130,v)):((v+180)%360+360)%360-180;}
  await call('SetSourceFilterSettings',{...await findTarget(),filterSettings,overlay:true});
  sendJson(res,await state());return true;
 }
 return false;
}});
