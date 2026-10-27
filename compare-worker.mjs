import {Simulation} from './engine.mjs?v=20261027marker1';
self.onmessage=event=>{
  const {config,window}=event.data,methods=['mpc','sdob','ra'],results=[];
  try{
    for(let i=0;i<methods.length;i++){
      const simulation=new Simulation({...config,mode:'tracking',method:methods[i]});
      for(let k=0;k<480;k++){
        simulation.step();
        if(k%40===0)self.postMessage({type:'progress',method:methods[i],progress:(i+k/480)/methods.length});
      }
      results.push({method:methods[i],metrics:simulation.metrics(window),finalTau:simulation.latest.tau,finalGain:simulation.latest.gain});
    }
    self.postMessage({type:'result',results});
  }catch(error){self.postMessage({type:'error',message:error.message});}
};
