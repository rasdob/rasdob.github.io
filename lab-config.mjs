import {DEFAULTS} from './engine.mjs?v=20261110cleanview';

export const ranges={frequency:[.08,.4],noise:[0,1.5],history:[.05,1.25],gain:[2,40]};
export function validatedConfig(candidate={}){
  if(!candidate||typeof candidate!=='object')candidate={};
  const c={...DEFAULTS,mode:'tracking',motion:'circle'};
  for(const [key,[low,high]] of Object.entries(ranges)){
    const value=Number(candidate[key]);if(Number.isFinite(value))c[key]=Math.min(high,Math.max(low,value));
  }
  c.gain=Math.round(c.gain);
  if(['ra','sdob','dob','mpc'].includes(candidate.method))c.method=candidate.method;
  if(['circle','spatial'].includes(candidate.motion))c.motion=candidate.motion;
  if(c.method==='sdob')c.history=.05;
  c.counts=c.method==='sdob'?[0,0,0,1000]:[...DEFAULTS.counts];
  c.weighting=c.method==='sdob'?'global':'grouped';
  return c;
}
