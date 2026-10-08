import {families,presets,controls,chain} from '/dsp.mjs';
const root=document.querySelector('main'),$=id=>root.querySelector('#'+id);
const shell=createRemoteShell({root,header:root.querySelector('header'),storageKey:'vocal-compact',title:'Vocal Studio',controlsId:'tuning',
 width:360,fullHeight:640,compactHeight:330,collapseTitle:'Show only presets and transport',onError:text=>setStatus(text)});
const stored=presets.find(p=>p.id===localStorage.getItem('vocal-preset'))||presets[0];
let settings={...stored},shownFamily=stored.family,mic=localStorage.getItem('vocal-mic')||'',devices=[];
let ctx,workletReady=false,stream,nodes,socket,running=false,muted=false,bypass=false,routeTimer,lastDraw=0,heldPeak=0;

function setStatus(text){$('status').textContent=text;}
function choose(preset){settings={...preset};shownFamily=preset.family;localStorage.setItem('vocal-preset',preset.id);apply();render();}

// Controls
for(const [id,label]of families){const b=document.createElement('button');b.role='tab';b.dataset.family=id;b.textContent=label;b.onclick=()=>{shownFamily=id;render();};$('families').append(b);}
for(const [key,label,min,max,step,unit]of controls){
 const row=document.createElement('label');row.className='slider';
 row.innerHTML=`<span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}" data-key="${key}"><output></output>`;
 const input=row.querySelector('input');input.oninput=()=>{settings[key]=Number(input.value);apply();render();};
 row.dataset.unit=unit;$('sliders').append(row);
}
$('mic').onchange=()=>{mic=$('mic').value;localStorage.setItem('vocal-mic',mic);};
$('start').onclick=()=>running?stop():start();
$('mute').onclick=()=>{muted=!muted;apply();render();};
$('bypass').onclick=()=>{bypass=!bypass;apply();render();};

function render(){
 $('dot').classList.toggle('live',running);
 for(const b of $('families').children)b.setAttribute('aria-selected',String(b.dataset.family===shownFamily));
 $('presets').replaceChildren(...presets.filter(p=>p.family===shownFamily).map(p=>{
  const b=document.createElement('button');b.className='preset'+(p.id===settings.id?' active':'');b.setAttribute('aria-pressed',String(p.id===settings.id));
  b.innerHTML='<strong></strong><small></small>';b.querySelector('strong').textContent=p.id;b.querySelector('small').textContent=p.subtitle;b.onclick=()=>choose(p);return b;}));
 for(const row of $('sliders').children){const input=row.querySelector('input'),value=settings[input.dataset.key];input.value=value;row.querySelector('output').textContent=value.toFixed(input.step<1?(input.step<.1?2:1):0)+row.dataset.unit;}
 $('mic').disabled=running;
 $('start').textContent=running?'Stop':'Start';$('start').classList.toggle('running',running);
 $('mute').textContent=muted?'Unmute':'Mute';$('mute').classList.toggle('on',muted);
 $('bypass').textContent=bypass?'Effects off':'Effects on';
}
function meter(peak){
 heldPeak=Math.max(heldPeak,peak);const now=performance.now();if(now-lastDraw<50&&peak)return;
 const db=Math.max(-60,20*Math.log10(Math.max(heldPeak,.001))),level=$('level');
 level.style.width=((db+60)/60*100)+'%';level.classList.toggle('hot',db>-3);level.setAttribute('aria-valuenow',String(Math.round(db)));
 lastDraw=now;heldPeak=0;
}

// Microphones
let defaultLabel='';
async function listDevices(){
 const all=await navigator.mediaDevices.enumerateDevices();
 defaultLabel=all.find(d=>d.kind==='audioinput'&&d.deviceId==='default')?.label||'';
 devices=all.filter(d=>d.kind==='audioinput'&&!['default','communications'].includes(d.deviceId)&&!/blackhole|aggregate/i.test(d.label));
 if(!devices.some(d=>d.deviceId===mic))mic=(devices.find(d=>/dji/i.test(d.label))||devices.find(d=>/airpods/i.test(d.label))||devices[0])?.deviceId||'';
 const options=devices.some(d=>d.label)?devices.map(d=>new Option(d.label,d.deviceId,false,d.deviceId===mic)):[new Option('Default mic · choose after you allow access','')];
 $('mic').replaceChildren(...options);
}
navigator.mediaDevices.addEventListener('devicechange',()=>{if(!running)listDevices();});
async function openMic(){
 const constraints=id=>({audio:{...(id?{deviceId:{exact:id}}:{}),echoCancellation:false,noiseSuppression:false,autoGainControl:false,channelCount:1}});
 if(!devices.some(d=>d.label)){(await navigator.mediaDevices.getUserMedia({audio:true})).getTracks().forEach(t=>t.stop());await listDevices();}
 try{return await navigator.mediaDevices.getUserMedia(constraints(mic));}
 catch(e){if(e.name!=='OverconstrainedError'&&e.name!=='NotFoundError')throw e;mic='';return navigator.mediaDevices.getUserMedia(constraints(''));}
}

// Audio chain: mic → rumble cut / EQ → noise expansion → compression → room → peak limiter → OBS
function roomImpulse(){const rate=ctx.sampleRate,length=Math.round(rate*.5),b=ctx.createBuffer(1,length,rate),d=b.getChannelData(0);for(let i=0;i<length;i++)d[i]=(Math.random()*2-1)*Math.exp(-i/(rate*.12));return b;}
function build(){
 const mono={channelCount:1,channelCountMode:'explicit',channelInterpretation:'speakers'};
 const filter=(type,frequency,Q=.7)=>new BiquadFilterNode(ctx,{type,frequency,Q});
 const n={
  source:ctx.createMediaStreamSource(stream),input:new GainNode(ctx,mono),
  highpass:filter('highpass',80),lowshelf:filter('lowshelf',160),mud:filter('peaking',350,1.4),presence:filter('peaking',3200,1.4),air:filter('highshelf',6000),
  expander:new AudioWorkletNode(ctx,'expander',{...mono,outputChannelCount:[1]}),compressor:new DynamicsCompressorNode(ctx),makeup:new GainNode(ctx),
  dry:new GainNode(ctx),room:new ConvolverNode(ctx,{buffer:roomImpulse()}),wet:new GainNode(ctx,{gain:0}),
  effects:new GainNode(ctx),bypassed:new GainNode(ctx,{gain:0}),
  limiter:new DynamicsCompressorNode(ctx,{threshold:-1.5,knee:0,ratio:20,attack:.003,release:.04}),
  out:new GainNode(ctx),tap:new AudioWorkletNode(ctx,'pcm-tap',{...mono,outputChannelCount:[1]}),sink:new GainNode(ctx,{gain:0}),
 };
 n.source.connect(n.input);
 n.input.connect(n.highpass).connect(n.lowshelf).connect(n.mud).connect(n.presence).connect(n.air).connect(n.expander).connect(n.compressor).connect(n.makeup);
 n.makeup.connect(n.dry).connect(n.effects);n.makeup.connect(n.room).connect(n.wet).connect(n.effects);
 n.effects.connect(n.limiter);n.input.connect(n.bypassed).connect(n.limiter);
 n.limiter.connect(n.out).connect(n.tap).connect(n.sink).connect(ctx.destination);
 n.tap.port.onmessage=({data})=>{if(socket?.readyState===1&&socket.bufferedAmount<96000)socket.send(data.pcm);meter(data.peak);};
 return n;
}
function apply(){
 if(!nodes)return;
 const c=chain(settings),n=nodes,set=(param,value)=>param.setTargetAtTime(value,ctx.currentTime,.02);
 set(n.highpass.frequency,c.highpass);set(n.lowshelf.gain,c.warmth);set(n.mud.gain,c.mud);
 set(n.presence.frequency,c.presence.frequency);set(n.presence.gain,c.presence.gain);set(n.air.frequency,c.air.frequency);set(n.air.gain,c.air.gain);
 set(n.expander.parameters.get('threshold'),c.expander.threshold);set(n.expander.parameters.get('ratio'),c.expander.ratio);
 for(const k of ['threshold','ratio','knee','attack','release'])set(n.compressor[k],c.compressor[k]);
 set(n.makeup.gain,c.makeup);set(n.wet.gain,c.room);
 set(n.effects.gain,bypass?0:1);set(n.bypassed.gain,bypass?1:0);set(n.out.gain,muted?0:.89125);
}
function openSocket(){return new Promise((resolve,reject)=>{const ws=new WebSocket(`ws://${location.host}/api/audio`);ws.binaryType='arraybuffer';ws.onopen=()=>resolve(ws);ws.onerror=()=>reject(Error('Could not reach the local audio server. Is npm run vocal still running?'));});}

async function start(){
 if(running)return;
 try{
  setStatus('Opening microphone…');
  ctx??=new AudioContext({sampleRate:48000,latencyHint:'interactive'});
  if(!workletReady){await ctx.audioWorklet.addModule('/processor.js');workletReady=true;}
  await ctx.resume();
  stream=await openMic();
  const track=stream.getAudioTracks()[0],info=track.getSettings();
  mic=info.deviceId||mic;localStorage.setItem('vocal-mic',mic);await listDevices();
  track.onended=()=>stop('Microphone disconnected · reconnect and Start');
  setStatus('Connecting local audio stream…');
  socket=await openSocket();socket.onclose=()=>{if(running)stop('Local audio server disconnected · restart it and Start');};
  nodes=build();apply();running=true;render();
  $('format').textContent=`${Math.round((info.sampleRate||ctx.sampleRate)/1000)} kHz input · 48 kHz to OBS`;
  setStatus('Live · processed voice to OBS');connectOBS(track.label);
 }catch(e){stop(e.name==='NotAllowedError'?'Allow microphone access for this page in Chrome, then Start':e.message);}
}
function stop(message='Stopped'){
 running=false;clearTimeout(routeTimer);
 const s=socket;socket=null;s?.close();
 stream?.getTracks().forEach(t=>{t.onended=null;t.stop();});stream=null;
 if(nodes){nodes.tap.port.onmessage=null;Object.values(nodes).forEach(n=>n.disconnect());nodes=null;}
 meter(0);$('route').textContent='OBS waiting';setStatus(message);render();
}

// OBS
async function api(path,body){const r=await fetch('/api/'+path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});const d=await r.json();if(!r.ok)throw Error(d.error);return d;}
async function connectOBS(label){
 try{const result=await api('connect-obs',{deviceLabel:label,defaultLabel});if(result.muted.length)setStatus('Live · muted raw '+result.muted.join(', ')+' in OBS');}
 catch(e){if(running)setStatus('Mic live · OBS connection needs attention: '+e.message);}
 pollRoute();
}
async function pollRoute(){
 if(!running)return;
 try{$('route').textContent=(await api('obs')).mediaState==='OBS_MEDIA_STATE_PLAYING'?'OBS connected':'OBS waiting';}catch{$('route').textContent='OBS offline';}
 if(running)routeTimer=shell.activeWindow().setTimeout(pollRoute,2000);
}

listDevices().catch(()=>{});render();shell.setCompact(shell.compact);
