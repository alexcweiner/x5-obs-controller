// Audio worklets: a downward expander for the noise floor and a 48 kHz PCM tap for OBS.
const coefficient=seconds=>Math.exp(-1/(seconds*sampleRate));
class Expander extends AudioWorkletProcessor{
 static get parameterDescriptors(){return [{name:'threshold',defaultValue:-52,minValue:-100,maxValue:0,automationRate:'k-rate'},{name:'ratio',defaultValue:1.6,minValue:1,maxValue:10,automationRate:'k-rate'}];}
 constructor(){super();this.envelope=0;this.gain=1;this.attack=coefficient(.008);this.release=coefficient(.14);this.smooth=coefficient(.01);}
 process([input],[output],parameters){
  const x=input[0],y=output[0];if(!x)return true;
  const threshold=parameters.threshold[0],ratio=parameters.ratio[0];
  for(let i=0;i<x.length;i++){
   const level=Math.abs(x[i]),k=level>this.envelope?this.attack:this.release;
   this.envelope=k*this.envelope+(1-k)*level;
   const db=20*Math.log10(this.envelope+1e-9),target=db<threshold?Math.pow(10,Math.max(-40,(db-threshold)*(ratio-1))/20):1;
   this.gain=this.smooth*this.gain+(1-this.smooth)*target;y[i]=x[i]*this.gain;
  }
  return true;
 }
}
class PcmTap extends AudioWorkletProcessor{
 constructor(){super();this.frame=new Int16Array(480);this.length=0;this.peak=0;}
 process([input]){
  const x=input[0];if(!x)return true;
  for(let i=0;i<x.length;i++){
   const s=Math.max(-.999,Math.min(.999,x[i]));this.peak=Math.max(this.peak,Math.abs(s));this.frame[this.length++]=s*32767;
   if(this.length===this.frame.length){this.port.postMessage({pcm:this.frame.buffer,peak:this.peak},[this.frame.buffer]);this.frame=new Int16Array(480);this.length=0;this.peak=0;}
  }
  return true;
 }
}
registerProcessor('expander',Expander);registerProcessor('pcm-tap',PcmTap);
