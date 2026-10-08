// Shared floating-remote shell: Document Picture-in-Picture popout plus a compact
// layout synced across every open copy of the remote through /api/ui.
(function(global){
function popoutBounds(contentHeight,chromeWidth,chromeHeight,screen,x,y,contentWidth=320){const left=screen.availLeft||0,top=screen.availTop||0,width=Math.min(contentWidth+chromeWidth,screen.availWidth),height=Math.min(Math.ceil(contentHeight)+chromeHeight,screen.availHeight);return {width,height,x:Math.max(left,Math.min(x,left+screen.availWidth-width)),y:Math.max(top,Math.min(y,top+screen.availHeight-height))};}
function createRemoteShell({root,header,storageKey,title,controlsId,width=320,fullHeight=700,compactHeight=76,
 collapseLabel='▴ Compact',expandLabel='▾ Expand',collapseTitle='Collapse to the essentials',expandTitle='Show all controls',
 onCompact=()=>{},onStop=()=>{},onKey=null,extraHeight=()=>0,onError=()=>{}}){
 let compact=false,pipWindow=null,writes=Promise.resolve();
 try{compact=localStorage.getItem(storageKey)==='true';}catch{}
 const floatButton=document.createElement('button');floatButton.id='float';floatButton.textContent='↗ Float above other windows';
 const pipHint=document.createElement('p');pipHint.id='pipHint';root.append(floatButton,pipHint);
 const compactToggle=document.createElement('button');compactToggle.id='compactToggle';if(controlsId)compactToggle.setAttribute('aria-controls',controlsId);header.append(compactToggle);
 const supported='documentPictureInPicture' in window;
 pipHint.textContent=supported?'Open the floating remote, then drag it anywhere. Keep this tab open.':`For always-on-top controls, open ${location.origin} in Chrome or Edge and click Float.`;
 const activeWindow=()=>pipWindow&&!pipWindow.closed?pipWindow:window;
 function fit(){
  if(!pipWindow||pipWindow.closed)return;
  const w=pipWindow,chromeHeight=Math.max(0,w.outerHeight-w.innerHeight),chromeWidth=Math.max(0,w.outerWidth-w.innerWidth);
  const b=popoutBounds(Math.max(root.getBoundingClientRect().height,extraHeight()),chromeWidth,chromeHeight,w.screen,w.screenX,w.screenY,width);
  try{w.resizeTo(b.width,b.height);if(w.screenX!==b.x||w.screenY!==b.y)w.moveTo(b.x,b.y);}catch{}
 }
 function setCompact(value,resize=false){
  compact=value;onCompact(compact);root.classList.toggle('compact',compact);
  compactToggle.textContent=compact?expandLabel:collapseLabel;compactToggle.setAttribute('aria-expanded',String(!compact));compactToggle.title=compact?expandTitle:collapseTitle;
  try{localStorage.setItem(storageKey,String(compact));}catch{}
  if(resize)fit();
 }
 function sync(body){writes=writes.then(async()=>{const r=await fetch('/api/ui',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});if(!r.ok)throw Error((await r.json()).error);}).catch(e=>onError('Layout sync failed: '+e.message));}
 compactToggle.onclick=()=>{setCompact(!compact,true);sync({compact});};
 floatButton.onclick=async()=>{
  if(!supported){pipHint.textContent=`This browser does not support control panels in PiP. Open ${location.origin} in Chrome or Edge.`;return;}
  try{
   if(pipWindow&&!pipWindow.closed){pipWindow.focus();return;}
   onStop();pipWindow=await window.documentPictureInPicture.requestWindow({width,height:Math.min(compact?compactHeight:fullHeight,window.screen.availHeight)});
   pipWindow.document.title=title;
   document.querySelectorAll('style,link[rel=stylesheet]').forEach(s=>pipWindow.document.head.append(s.cloneNode(true)));
   pipWindow.document.body.className='floating';pipWindow.document.body.append(root);fit();
   if(onKey)pipWindow.addEventListener('keydown',onKey);
   pipWindow.addEventListener('blur',onStop);
   pipWindow.addEventListener('pagehide',()=>{onStop();document.body.prepend(root);pipWindow=null;},{once:true});
  }catch(e){pipHint.textContent='Could not open floating remote: '+e.message;}
 };
 const events=new EventSource('/api/ui/events');
 events.onmessage=event=>{const state=JSON.parse(event.data);if(state.compact===null)sync({compact,initialize:true});else if(typeof state.compact==='boolean'&&state.compact!==compact)setCompact(state.compact,true);};
 return {fit,setCompact,activeWindow,compactToggle,get compact(){return compact;}};
}
global.popoutBounds=popoutBounds;global.createRemoteShell=createRemoteShell;
})(globalThis);
