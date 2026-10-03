import {call,close} from '../lib/obs.mjs';
import {fileURLToPath} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';

const args=process.argv.slice(2),apply=args.includes('--apply');
if(args.includes('--help')){
 console.log('npm run setup -- [--source "Video Capture Device"] [--apply]\nWithout --apply: inspect and print a plan. Requires OBS running and obs-shaderfilter installed. macOS capture-mode automation only.');
 process.exit(0);
}
const sourceIndex=args.indexOf('--source');
if(sourceIndex>=0&&(!args[sourceIndex+1]||args[sourceIndex+1].startsWith('--')))throw Error('--source needs an OBS source name');
const requested=sourceIndex>=0?args[sourceIndex+1]:null;
const shader=fileURLToPath(new URL('../shaders/insta360-x5-flat-view.shader',import.meta.url));
try{
 const {inputs}=await call('GetInputList');const candidates=[];
 for(const input of inputs){
  if(requested&&input.inputName!==requested)continue;
  const {inputSettings}=await call('GetInputSettings',{inputName:input.inputName});
  if(requested||/insta360.*x5/i.test(inputSettings.device_name||input.inputName))candidates.push({input,settings:inputSettings});
 }
 if(candidates.length!==1)throw Error('Choose exactly one existing X5 capture source with --source "Source name". Candidates: '+candidates.map(c=>c.input.inputName).join(', '));
 const {input,settings}=candidates[0],sourceName=input.inputName;
 if(!input.inputKind.startsWith('macos-avcapture'))throw Error('Automatic capture configuration currently supports macOS AV capture only. Use manual setup in README for other platforms.');
 const {sourceFilterKinds}=await call('GetSourceFilterKindList');
 if(!sourceFilterKinds?.includes('shader_filter'))throw Error('Install Exeldro obs-shaderfilter and restart OBS first.');
 const {propertyItems:devices}=await call('GetInputPropertiesListPropertyItems',{inputName:sourceName,propertyName:'device'});
 if(!devices.some(d=>d.itemValue===settings.device&&d.itemEnabled))throw Error('Selected camera is unavailable. Reconnect and select the current X5 device in OBS first.');
 const {filters}=await call('GetSourceFilterList',{sourceName});
 const matches=filters.filter(f=>f.filterKind==='shader_filter'&&String(f.filterSettings.shader_file_name).endsWith('insta360-x5-flat-view.shader'));
 if(matches.length>1)throw Error('Multiple X5 view filters found; remove ambiguity in OBS first.');
 const existing=matches[0],filterName=existing?.filterName||'X5 View';
 if(!existing&&filters.some(f=>f.filterName===filterName))throw Error('An unrelated filter named X5 View already exists. Rename it first.');
 let format;
 try{const {propertyItems}=await call('GetInputPropertiesListPropertyItems',{inputName:sourceName,propertyName:'supported_format'});format=propertyItems.find(p=>p.itemEnabled&&String(p.itemName).includes('2880x1440')&&String(p.itemName).includes('30 FPS'));}catch{}
 if(!format)throw Error('2880x1440 / 30 FPS format not available. In OBS source properties uncheck Use Preset, select that format, then rerun.');
 const inputSettings={use_preset:false,supported_format:format.itemValue,frame_rate:{numerator:30,denominator:1}};
 const filterSettings={from_file:true,override_entire_effect:false,shader_file_name:shader};
 console.log(JSON.stringify({mode:apply?'apply':'dry-run',sourceName,inputSettings,filterName,action:existing?'update shader path (preserve view)':'add view filter',shader},null,2));
 if(apply){
  const dir=new URL('../backups/',import.meta.url);await mkdir(dir,{recursive:true});
  const backup=new URL(Date.now()+'.json',dir);
  await writeFile(backup,JSON.stringify({sourceName,inputSettings:settings,filters},null,2),{mode:0o600,flag:'wx'});
  console.log('Backup:',fileURLToPath(backup));
  await call('SetInputSettings',{inputName:sourceName,inputSettings,overlay:true});
  if(existing)await call('SetSourceFilterSettings',{sourceName,filterName,filterSettings,overlay:true});
  else await call('CreateSourceFilter',{sourceName,filterName,filterKind:'shader_filter',filterSettings});
  await call('SetSourceFilterEnabled',{sourceName,filterName,filterEnabled:true});
  const verified=await call('GetSourceFilter',{sourceName,filterName});
  if(!verified.filterEnabled||verified.filterSettings.shader_file_name!==shader)throw Error('Filter readback did not match setup. See backup and inspect OBS.');
  console.log('Filter attached and settings verified. Check the OBS preview, then npm start.');
 }else console.log('No changes made. Repeat with --apply to configure OBS.');
}catch(e){console.error(e.message);process.exitCode=1;}finally{close();}
