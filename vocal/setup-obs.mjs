import {call} from '../lib/obs.mjs';
import {writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
export const sourceName='Vocal Studio · Processed Mic';
export const streamURL='http://127.0.0.1:4791/live.wav';

// Chrome labels add "Default - " and suffixes like " (2ca3:4011)" or " (Bluetooth)"; OBS shows the bare device name.
export function sameMic(obsName,browserLabel){
 const norm=s=>String(s||'').toLowerCase().replace(/^default\s*-\s*/,'').replace(/(\s*\([^)]*\))+\s*$/,'').trim();
 return !!norm(obsName)&&norm(obsName)===norm(browserLabel);
}

// OBS inputs on "Default" follow the macOS default mic; the browser reports which mic that is.
async function rawInputsFor(deviceLabel,defaultLabel,inputs){
 const matches=[];
 for(const i of inputs.filter(i=>i.inputKind==='coreaudio_input_capture')){
  const {inputSettings}=await call('GetInputSettings',{inputName:i.inputName});
  let name=inputSettings.device_id==='default'||!inputSettings.device_id?defaultLabel:'';
  if(!name)try{const {propertyItems}=await call('GetInputPropertiesListPropertyItems',{inputName:i.inputName,propertyName:'device_id'});name=propertyItems.find(p=>p.itemValue===inputSettings.device_id)?.itemName;}catch{}
  if(sameMic(name,deviceLabel))matches.push({inputName:i.inputName,...await call('GetInputMute',{inputName:i.inputName})});
 }
 return matches;
}

export async function setupOBS(deviceLabel,defaultLabel=''){
 const {currentProgramSceneName:sceneName}=await call('GetSceneList');
 const {inputs}=await call('GetInputList');
 const existing=inputs.find(i=>i.inputName===sourceName);
 if(existing&&existing.inputKind!=='ffmpeg_source')throw Error('The Vocal Studio source name is already used by another source type');
 const settings={is_local_file:false,input:streamURL,input_format:'wav',restart_on_activate:false,close_when_inactive:false,buffering_mb:0,reconnect_delay_sec:1,clear_on_media_end:false,ffmpeg_options:'probesize=32768 analyzeduration=0'};
 const originals=await rawInputsFor(deviceLabel,defaultLabel,inputs);
 const backup=join(tmpdir(),`vocal-studio-obs-${Date.now()}.json`);
 await writeFile(backup,JSON.stringify({sceneName,sourceName,originals,previous:existing?await call('GetInputSettings',{inputName:sourceName}):null},null,2),{mode:0o600});
 if(!existing)await call('CreateInput',{sceneName,inputName:sourceName,inputKind:'ffmpeg_source',inputSettings:settings,sceneItemEnabled:true});
 else{
  await call('SetInputSettings',{inputName:sourceName,inputSettings:settings,overlay:true});
  const {sceneItems}=await call('GetSceneItemList',{sceneName});const item=sceneItems.find(i=>i.sourceName===sourceName);
  if(!item)await call('CreateSceneItem',{sceneName,sourceName,sceneItemEnabled:true});
  else await call('SetSceneItemEnabled',{sceneName,sceneItemId:item.sceneItemId,sceneItemEnabled:true});
 }
 await call('SetInputMute',{inputName:sourceName,inputMuted:false});
 await call('SetInputAudioMonitorType',{inputName:sourceName,monitorType:'OBS_MONITORING_TYPE_NONE'});
 await call('TriggerMediaInputAction',{inputName:sourceName,mediaAction:'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART'});
 // Only replace a duplicate raw mic after OBS confirms the processed stream is playing.
 let playing=false;
 for(let i=0;i<10;i++){if((await call('GetMediaInputStatus',{inputName:sourceName})).mediaState==='OBS_MEDIA_STATE_PLAYING'){playing=true;break;}await new Promise(r=>setTimeout(r,300));}
 if(playing)for(const original of originals)await call('SetInputMute',{inputName:original.inputName,inputMuted:true});
 return {sourceName,sceneName,backup,playing,muted:playing?originals.map(o=>o.inputName):[]};
}
