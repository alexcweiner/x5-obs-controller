// Vocal presets and the mapping from user controls to the Web Audio chain.
export const families=[['DJI','DJI Mic Mini'],['AirPods','AirPods']];
export const presets=[
 {id:'Clean & natural',subtitle:'Everyday calls and livestreams',warmth:1,clarity:1.5,compression:.35,gate:-52,gain:2,room:0,family:'DJI'},
 {id:'Warm podcast',subtitle:'Full, smooth and close',warmth:3,clarity:1,compression:.65,gate:-48,gain:4,room:0,family:'DJI'},
 {id:'Crisp presenter',subtitle:'Clear speech that cuts through',warmth:.5,clarity:3,compression:.55,gate:-50,gain:3,room:0,family:'DJI'},
 {id:'Soft & intimate',subtitle:'Gentle highs and quiet detail',warmth:2,clarity:-1,compression:.4,gate:-56,gain:3,room:0,family:'DJI'},
 {id:'Airy studio',subtitle:'A subtle room around your voice',warmth:1.5,clarity:2,compression:.45,gate:-52,gain:3,room:5,family:'DJI'},
 {id:'AirPods · Natural',subtitle:'Balanced speech, light processing',warmth:1.5,clarity:.5,compression:.2,gate:-56,gain:0,room:0,family:'AirPods'},
 {id:'AirPods · Warm',subtitle:'Soften the headset edge',warmth:3,clarity:-1,compression:.3,gate:-54,gain:1,room:0,family:'AirPods'},
 {id:'AirPods · Focus',subtitle:'Clear, steady voice for calls',warmth:1,clarity:1.5,compression:.4,gate:-52,gain:1,room:0,family:'AirPods'},
 {id:'AirPods · Soft',subtitle:'Relaxed highs, gentle dynamics',warmth:2,clarity:-2,compression:.15,gate:-58,gain:0,room:0,family:'AirPods'}];
export const controls=[
 ['warmth','Warmth',-4,6,.1,' dB'],['clarity','Clarity',-4,6,.1,' dB'],['compression','Compression',0,1,.01,''],
 ['gate','Noise floor',-60,-30,1,' dB'],['gain','Output gain',-12,12,.1,' dB'],['room','Room',0,15,.5,' %']];

// AirPods get a higher rumble cut, a lower presence band and subdued highs.
export function chain(s){
 const airpods=s.family==='AirPods';
 return {
  highpass:airpods?100:80,warmth:s.warmth,mud:-2,
  presence:{frequency:airpods?2200:3200,gain:s.clarity},air:{frequency:6000,gain:airpods?-3:-2},
  expander:{threshold:s.gate,ratio:1.6},
  compressor:{threshold:-12-s.compression*16,ratio:1+s.compression*5,knee:6,attack:.008,release:.14},
  makeup:Math.pow(10,s.gain/20),room:s.room/100,
 };
}
