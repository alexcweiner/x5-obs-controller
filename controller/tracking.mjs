// Follow-mode math. Mirrors the shader: Field_Of_View is vertical, image y grows
// downward, positive Yaw looks right and positive Pitch looks up.
const EYE_A=33,EYE_B=263,NOSE_TIP=1;
const WRIST=0,INDEX_MCP=5,INDEX_TIP=8,MIDDLE_MCP=9,MIDDLE_TIP=12,RING_MCP=13,RING_TIP=16,PINKY_MCP=17;
const dist=(pts,a,b,aspect)=>Math.hypot((pts[a].x-pts[b].x)*aspect,pts[a].y-pts[b].y);
function bounds(pts){
 let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
 for(const p of pts){x0=Math.min(x0,p.x);y0=Math.min(y0,p.y);x1=Math.max(x1,p.x);y1=Math.max(y1,p.y);}
 return {x0,y0,x1,y1};
}

// Normalized image point to frame: eye midpoint blended with the nose tip. Both stay
// visible under a hat brim; nose alone when the eyes are missing.
export function facePoint(face){
 if(!face)return null;
 const a=face[EYE_A],b=face[EYE_B],n=face[NOSE_TIP];
 if(a&&b){const x=(a.x+b.x)/2,y=(a.y+b.y)/2;return n?[x*.7+n.x*.3,y*.7+n.y*.3]:[x,y];}
 return n?[n.x,n.y]:null;
}

// Distance between the outer eye corners in image-height units.
export function eyeSpan(face,aspect){return face?.[EYE_A]&&face[EYE_B]?dist(face,EYE_A,EYE_B,aspect):0;}

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

// Log palm size for two hands (left to right in the image), relative to the eye span
// so zooming does not read as a push. No face, no reach.
export function handReach(hands,face,{aspect}){
 if(!hands||hands.length<2)return null;
 const scale=eyeSpan(face,aspect);if(scale<.005)return null;
 const pair=[...hands].sort((a,b)=>a[WRIST].x-b[WRIST].x).slice(0,2);
 return {kind:'face',values:pair.map(h=>Math.log(palmSize(h,aspect)/scale))};
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

// Both open palms beside the face, one on each side and around face height: frame the
// face and hands together. Returns the box, its center, and the field of view that makes
// the box fill `fill` of the shot on its tighter axis; null when the pose is not held.
export function focusFrame(face,hands,{aspect,fov,fill=.8,margin=.02}){
 if(!face?.[NOSE_TIP]||!hands||hands.length<2)return null;
 const nose=face[NOSE_TIP],f=bounds(face),reach=(f.y1-f.y0)/2;
 const pair=[...hands].sort((a,b)=>a[WRIST].x-b[WRIST].x).slice(0,2),boxes=pair.map(bounds);
 if(!(boxes[0].x1<nose.x&&boxes[1].x0>nose.x))return null;
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
