// Follow-mode math. Mirrors the shader: Field_Of_View is vertical, image y grows
// downward, positive Yaw looks right and positive Pitch looks up.
const EYE_A=33,EYE_B=263,NOSE_TIP=1,LIP_TOP=13,LIP_BOTTOM=14;
const P_NOSE=0,P_LEFT_EYE=2,P_RIGHT_EYE=5,P_LEFT_EAR=7,P_RIGHT_EAR=8,P_MOUTH_LEFT=9,P_MOUTH_RIGHT=10;
const WRIST=0,INDEX_MCP=5,INDEX_TIP=8,MIDDLE_MCP=9,MIDDLE_TIP=12,RING_MCP=13,RING_TIP=16,PINKY_MCP=17;
const visible=(p,min)=>p&&(p.visibility??1)>=min;
const mid=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
const span=(a,b,aspect)=>Math.hypot((a.x-b.x)*aspect,a.y-b.y);
const dist=(pts,a,b,aspect)=>span(pts[a],pts[b],aspect);
const aimAt=(eyes,nose)=>eyes?[eyes.x*.7+nose.x*.3,eyes.y*.7+nose.y*.3]:[nose.x,nose.y];
// Clockwise on-screen head tilt in degrees from the eyes-to-mouth line: 0 upright, ±180 upside down.
// Unlike the eye line it needs no left/right labels and holds when the head turns sideways.
const headTilt=(eyes,mouth,aspect)=>eyes&&mouth?Math.atan2(-(mouth.x-eyes.x)*aspect,mouth.y-eyes.y)*180/Math.PI:null;
function bounds(pts){
 let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
 for(const p of pts)if(p){x0=Math.min(x0,p.x);y0=Math.min(y0,p.y);x1=Math.max(x1,p.x);y1=Math.max(y1,p.y);}
 return {x0,y0,x1,y1};
}

// Square pixel crop around the pose head. The face model only finds faces that fill much
// of its input, so a small or side-on face in the full frame is missed without this.
export function headCrop(pose,{width,height},minVisibility=.3){
 const head=pose?.slice(0,11);if(head?.length!==11||!visible(head[P_NOSE],minVisibility))return null;
 const px=p=>({x:p.x*width,y:p.y*height});
 const ears=span(px(head[P_LEFT_EAR]),px(head[P_RIGHT_EAR]),1),eyeMouth=span(px(mid(head[P_LEFT_EYE],head[P_RIGHT_EYE])),px(mid(head[P_MOUTH_LEFT],head[P_MOUTH_RIGHT])),1);
 const size=Math.max(48,4*Math.max(ears,2.5*eyeMouth)),cx=head.reduce((s,p)=>s+p.x,0)/11*width,cy=head.reduce((s,p)=>s+p.y,0)/11*height;
 return {x:cx-size/2,y:cy-size/2,size};
}

// Landmarks found in a crop, back in normalized full-frame coordinates.
export function fromCrop(landmarks,crop,{width,height}){return landmarks.map(p=>({...p,x:(crop.x+p.x*crop.size)/width,y:(crop.y+p.y*crop.size)/height}));}

// What Follow needs from a head: the point to aim at (eye midpoint blended with the nose
// tip, both visible under a hat brim), the nose x, a box, and a size scale. The scale is
// eye-to-mouth distance in image-height units, which holds when the head turns sideways.
export function headFromFace(face,aspect){
 const nose=face?.[NOSE_TIP];if(!nose)return null;
 const eyes=face[EYE_A]&&face[EYE_B]?mid(face[EYE_A],face[EYE_B]):null,mouth=face[LIP_TOP]&&face[LIP_BOTTOM]?mid(face[LIP_TOP],face[LIP_BOTTOM]):null;
 return {source:'face',point:aimAt(eyes,nose),noseX:nose.x,box:bounds(face),scale:eyes&&mouth?span(eyes,mouth,aspect):0,tilt:headTilt(eyes,mouth,aspect)};
}

// Fallback from the pose model's nose, eyes, ears, and mouth when the face model misses.
export function headFromPose(pose,aspect,minVisibility=.3){
 const head=pose?.slice(0,11);if(head?.length!==11||!visible(head[P_NOSE],minVisibility))return null;
 const nose=head[P_NOSE],eyes=mid(head[P_LEFT_EYE],head[P_RIGHT_EYE]),mouth=mid(head[P_MOUTH_LEFT],head[P_MOUTH_RIGHT]),scale=span(eyes,mouth,aspect);
 const b=bounds(head),cx=(b.x0+b.x1)/2,half=Math.max((b.x1-b.x0)/2+.2*scale/aspect,.8*scale/aspect);
 return {source:'pose',point:aimAt(eyes,nose),noseX:nose.x,box:{x0:cx-half,y0:eyes.y-1.1*scale,x1:cx+half,y1:eyes.y+1.6*scale},scale,tilt:headTilt(eyes,mouth,aspect)};
}

// Degrees of view Roll that straighten a tilted head; positive Roll turns the picture
// counterclockwise. The deadzone leaves a cocked head alone, and the step is capped so
// an upside-down start turns over smoothly instead of snapping.
export function rollToLevel(tilt,{dead=12,gain=.3,maxStep=8}={}){
 if(tilt==null||Math.abs(tilt)<dead)return 0;
 return Math.max(-maxStep,Math.min(maxStep,tilt*gain));
}

// Degrees of local yaw/pitch that move `point` to the headroom line.
export function aimDelta([u,v],{fov,aspect,headroom=.4,deadzone=.05}){
 const s=Math.tan(fov*Math.PI/360),k=180/Math.PI;
 const direction=(u,v)=>{const x=(u-.5)*2*s*aspect,y=(v-.5)*2*s;return {yaw:Math.atan(x)*k,pitch:Math.asin(-y/Math.hypot(x,y,1))*k};};
 const subject=direction(u,v),target=direction(.5,headroom),dead=fov*deadzone;
 const yaw=subject.yaw,pitch=subject.pitch-target.pitch;
 return {yaw:Math.abs(yaw)<dead*aspect?0:yaw,pitch:Math.abs(pitch)<dead?0:pitch};
}

// Fraction of the correction to apply per frame; faster near the edges so a quick move is not lost.
export function aimGain([u,v]){return Math.min(u,1-u,v,1-v)<.15?.6:.35;}

// Largest palm edge in image-height units. A hand pushed toward the camera looks bigger.
export function palmSize(hand,aspect){
 return Math.max(dist(hand,WRIST,INDEX_MCP,aspect),dist(hand,WRIST,PINKY_MCP,aspect),dist(hand,INDEX_MCP,PINKY_MCP,aspect));
}

// Open hand facing the camera: wide knuckle span for its length (not edge-on) and
// index, middle, and ring fingertips well past their knuckles (not a fist).
export function openPalm(hand,aspect){
 const length=dist(hand,WRIST,MIDDLE_MCP,aspect);if(length<1e-6)return false;
 if(dist(hand,INDEX_MCP,PINKY_MCP,aspect)/length<.45)return false;
 return [[INDEX_TIP,INDEX_MCP],[MIDDLE_TIP,MIDDLE_MCP],[RING_TIP,RING_MCP]].every(([tip,knuckle])=>dist(hand,WRIST,tip,aspect)>1.4*dist(hand,WRIST,knuckle,aspect));
}

// Log palm size for two hands (left to right in the image), relative to the head scale
// so zooming does not read as a push. Without a head, `fov` stands in: apparent size
// scales with 1/tan(fov/2), so palm size times tan(fov/2) holds still while zooming.
export function handReach(hands,head,{aspect,fov}){
 if(!hands||hands.length<2)return null;
 const pair=[...hands].sort((a,b)=>a[WRIST].x-b[WRIST].x).slice(0,2);
 if(head?.scale>=.005)return {kind:head.source,values:pair.map(h=>Math.log(palmSize(h,aspect)/head.scale))};
 if(!(fov>0))return null;
 const t=Math.tan(fov*Math.PI/360);
 return {kind:'view',values:pair.map(h=>Math.log(palmSize(h,aspect)*t))};
}

// Luma of RGBA pixels, one float per pixel.
export function toGray({data,width,height}){
 const g=new Float32Array(width*height);
 for(let i=0,j=0;i<g.length;i++,j+=4)g[i]=.299*data[j]+.587*data[j+1]+.114*data[j+2];
 return g;
}

// Square patch of `size` pixels centered on (cx,cy), kept inside the image.
export function grayPatch(gray,width,height,[cx,cy],size){
 const x0=Math.round(Math.max(0,Math.min(width-size,cx-size/2))),y0=Math.round(Math.max(0,Math.min(height-size,cy-size/2))),p=new Float32Array(size*size);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++)p[y*size+x]=gray[(y0+y)*width+x0+x];
 return p;
}

// Spread of a patch; a flat patch (blank wall) cannot be tracked.
export function patchContrast(p){let sum=0,sq=0;for(const v of p){sum+=v;sq+=v*v;}const mean=sum/p.length;return Math.sqrt(Math.max(0,sq/p.length-mean*mean));}

// Best zero-mean normalized cross-correlation match for `template` within `radius` pixels
// of (cx,cy): a coarse scan, then a one-pixel refine. Score is -1..1; returns the match center.
export function findTemplate(gray,width,height,template,size,[cx,cy],radius){
 const n=size*size;let tSum=0,tSq=0;for(const v of template){tSum+=v;tSq+=v*v;}
 const tMean=tSum/n,tVar=tSq-n*tMean*tMean;
 const score=(x0,y0)=>{
  let s=0,sum=0,sq=0;
  for(let y=0;y<size;y++){const row=(y0+y)*width+x0,t=y*size;for(let x=0;x<size;x++){const v=gray[row+x];sum+=v;sq+=v*v;s+=v*template[t+x];}}
  const mean=sum/n,iVar=sq-n*mean*mean;
  return iVar<1e-6||tVar<1e-6?0:(s-n*mean*tMean)/Math.sqrt(iVar*tVar);
 };
 const cxl=x=>Math.max(0,Math.min(width-size,x)),cyl=y=>Math.max(0,Math.min(height-size,y));
 let best={score:-2,x:0,y:0};
 const scan=(xa,xb,ya,yb,step)=>{for(let y=ya;y<=yb;y+=step)for(let x=xa;x<=xb;x+=step){const s=score(x,y);if(s>best.score)best={score:s,x,y};}};
 const ox=Math.round(cx-size/2),oy=Math.round(cy-size/2);
 scan(cxl(ox-radius),cxl(ox+radius),cyl(oy-radius),cyl(oy+radius),3);
 scan(cxl(best.x-2),cxl(best.x+2),cyl(best.y-2),cyl(best.y+2),1);
 return {x:best.x+size/2,y:best.y+size/2,score:best.score};
}

// Field-of-view step from a two-hand push (positive, zoom out) or pull (negative, zoom in).
// The baseline eases toward the current reach so a held pose stops zooming.
export function zoomFromReach(baseline,reach,{dead=.15,gain=10,maxStep=2,ease=.05}={}){
 if(!reach)return {step:0,baseline:null,delta:null};
 if(!baseline||baseline.kind!==reach.kind)return {step:0,baseline:{kind:reach.kind,values:[...reach.values]},delta:[0,0]};
 const [l,r]=reach.values.map((v,i)=>v-baseline.values[i]);
 let step=0;
 if(l>dead&&r>dead)step=Math.min(maxStep,(Math.min(l,r)-dead)*gain);
 else if(l<-dead&&r<-dead)step=-Math.min(maxStep,(Math.min(-l,-r)-dead)*gain);
 return {step,delta:[l,r],baseline:{kind:reach.kind,values:baseline.values.map((b,i)=>b+(reach.values[i]-b)*ease)}};
}

// Both open palms beside the head, one on each side and around face height: frame the
// head and hands together. Returns the box, its center, and the field of view that makes
// the box fill `fill` of the shot on its tighter axis; null when the pose is not held.
export function focusFrame(head,hands,{aspect,fov,fill=.8,margin=.02}){
 if(!head||!hands||hands.length<2)return null;
 const f=head.box,reach=(f.y1-f.y0)/2;
 const pair=[...hands].sort((a,b)=>a[WRIST].x-b[WRIST].x).slice(0,2),boxes=pair.map(bounds);
 if(!(boxes[0].x1<head.noseX&&boxes[1].x0>head.noseX))return null;
 for(const hand of pair){
  const palmY=(hand[WRIST].y+hand[MIDDLE_MCP].y)/2;
  if(palmY<f.y0-reach||palmY>f.y1+reach||!openPalm(hand,aspect))return null;
 }
 const all=[f,...boxes],box={x0:Math.min(...all.map(b=>b.x0))-margin,y0:Math.min(...all.map(b=>b.y0))-margin,x1:Math.max(...all.map(b=>b.x1))+margin,y1:Math.max(...all.map(b=>b.y1))+margin};
 const s=Math.tan(fov*Math.PI/360)*Math.max(box.x1-box.x0,box.y1-box.y0)/fill;
 return {box,point:[(box.x0+box.x1)/2,(box.y0+box.y1)/2],fov:Math.min(130,Math.max(10,2*Math.atan(s)*180/Math.PI))};
}

// While lost, widen toward `searchFov`; once found, ease back to the chosen field of view.
export function nextFov(current,{found,chosen,lostFor,searchFov=100,searchStep=3,returnRate=.2}){
 if(!found)return lostFor>400&&current<searchFov?Math.min(searchFov,current+searchStep):current;
 return Math.abs(chosen-current)<.1?chosen:current+(chosen-current)*returnRate;
}
