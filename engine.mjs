// Browser teaching model derived from submit_v1.tex. No robot or network API.
// World: 2-D target/camera translations, fixed optical depth and orientation.
// Estimators receive observations only; truth stays in Simulation for scoring.
export const H = 0.05;
export const FOCAL = 480;
export const DEPTH = 0.58;
export const SCALE = FOCAL / DEPTH;
export const SIZE = [640, 360];
export const MARKER_SIDE = 0.11;
export const DEFAULTS = Object.freeze({mode:'estimate', motion:'circle', method:'ra', frequency:0.40, speed:0.07, radius:0.04, noise:0.35, history:0.75, sigma:0.25, gain:10, tau:0.18, plantGain:0.8, horizon:12, seed:13, counts:[100,100,93,100], weighting:'grouped', duration:24});
export const clamp = (x,a,b) => Math.max(a,Math.min(b,x));
export const norm = a => Math.hypot(...a);
const dot = (a,b) => a.reduce((s,x,i)=>s+x*b[i],0);
const add = (a,b) => a.map((x,i)=>x+b[i]);
const mul = (a,s) => a.map(x=>x*s);
const zeros = n => Array(n).fill(0);
export function random(seed=13) {
  let state=seed>>>0, spare=null;
  const uniform=()=>{state=(state+0x6D2B79F5)>>>0;let t=state;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
  return {uniform, normal(){if(spare!==null){const s=spare;spare=null;return s;}const r=Math.sqrt(-2*Math.log(Math.max(uniform(),1e-12))),a=2*Math.PI*uniform();spare=r*Math.sin(a);return r*Math.cos(a);}};
}
export function responseStep(q,v,u,tau,g,h=H) {
  const a=Math.exp(-h/tau), b=tau*(1-a)/h;
  return {q:q.map((x,i)=>x+h*(b*v[i]+g*(1-b)*u[i])),v:v.map((x,i)=>a*x+g*(1-a)*u[i])};
}
export function project(center,camera=[0,0]) {
  const half=MARKER_SIDE/2;
  return [[-half,-half],[half,-half],[half,half],[-half,half]].map(o=>[320+SCALE*(center[0]+o[0]-camera[0]),180+SCALE*(center[1]+o[1]-camera[1])]);
}
export function targetAt(t,config) {
  const s=t, w=2*Math.PI*config.frequency, r=config.radius;
  if(s<0)return {p:[0,0],v:[0,0]};
  if(config.motion==='line'){
    const travel=Math.min(.2,config.speed*s);
    return {p:[travel,0],v:s<.2/config.speed?[config.speed,0]:[0,0]};
  }
  if(config.motion==='irregular'){
    // Fixed deterministic multi-frequency path; not communicated to the bank.
    const ax=[.63,.26,.11], fx=[1,2.37,4.11], ay=[.58,.28,.14], fy=[.83,1.79,3.31];
    return {p:[r*ax.reduce((v,a,i)=>v+a*Math.sin(w*fx[i]*s),0),r*ay.reduce((v,a,i)=>v+a*(Math.cos(w*fy[i]*s)-1),0)],v:[r*w*ax.reduce((v,a,i)=>v+a*fx[i]*Math.cos(w*fx[i]*s),0),-r*w*ay.reduce((v,a,i)=>v+a*fy[i]*Math.sin(w*fy[i]*s),0)]};
  }
  return {p:[r*Math.sin(w*s),r*(1-Math.cos(w*s))],v:[r*w*Math.cos(w*s),r*w*Math.sin(w*s)]};
}
function solve(matrix,rhs) {
  const n=rhs.length,a=matrix.map((r,i)=>[...r,rhs[i]]);
  for(let k=0;k<n;k++){
    let p=k;for(let i=k+1;i<n;i++)if(Math.abs(a[i][k])>Math.abs(a[p][k]))p=i;
    [a[k],a[p]]=[a[p],a[k]];
    if(Math.abs(a[k][k])<1e-14)return zeros(n);
    const v=a[k][k];for(let j=k;j<=n;j++)a[k][j]/=v;
    for(let i=0;i<n;i++)if(i!==k){const v=a[i][k];for(let j=k;j<=n;j++)a[i][j]-=v*a[k][j];}
  }
  return a.map(r=>r[n]);
}
function regression(basis,positions,weights,ridge=1e-8) {
  const n=basis[0].length, gram=Array.from({length:n},()=>zeros(n));
  for(let i=0;i<n;i++)for(let j=0;j<n;j++)gram[i][j]=basis.reduce((s,b,k)=>s+weights[k]*b[i]*b[j],0)+(i===j&&i>0?ridge:0);
  return [0,1].map(d=>solve(gram,basis[0].map((_,i)=>basis.reduce((s,b,k)=>s+weights[k]*b[i]*positions[k][d],0))));
}
// Exact integration of linearly interpolated acceleration, anchored at t=0.
// This is a planar teaching approximation, not the paper's 3-D replay engine.
export function accelerationPath(knots, acceleration) {
  if(knots.length<2||knots.length!==acceleration.length||knots.some((t,i)=>!Number.isFinite(t)||(i&&t<=knots[i-1]))||knots[0]>0||knots.at(-1)<0||acceleration.some(a=>a.length!==2||!a.every(Number.isFinite)))throw new Error('Invalid acceleration knots');
  const states=[{p:[0,0],v:[0,0]}],jerks=[];
  for(let i=0;i<knots.length-1;i++){
    const h=knots[i+1]-knots[i],j=acceleration[i].map((x,d)=>(acceleration[i+1][d]-x)/h),old=states[i];jerks.push(j);
    states.push({p:old.p.map((x,d)=>x+h*old.v[d]+h*h*acceleration[i][d]/2+h**3*j[d]/6),v:old.v.map((x,d)=>x+h*acceleration[i][d]+h*h*j[d]/2)});
  }
  const raw=t=>{
    if(t<knots[0]-1e-9||t>knots.at(-1)+1e-9)throw new Error('Forecast outside acceleration knots');
    let i=0;while(i<knots.length-2&&knots[i+1]<=t)i++;
    const h=t-knots[i],a=acceleration[i],j=jerks[i],s=states[i];
    return {p:s.p.map((x,d)=>x+h*s.v[d]+h*h*a[d]/2+h**3*j[d]/6),v:s.v.map((x,d)=>x+h*a[d]+h*h*j[d]/2)};
  };
  const zero=raw(0);
  return t=>{const s=raw(t);return {p:s.p.map((x,d)=>x-zero.p[d]-t*zero.v[d]),v:s.v.map((x,d)=>x-zero.v[d])};};
}
export function selectFamily(scores,previous=-1){
  const minimum=Math.min(...scores);if(!Number.isFinite(minimum))return -1;
  return previous>=0&&scores[previous]===minimum?previous:scores.indexOf(minimum);
}
// Normalize within each family, then score its weighted pixel prediction.
export function scoreFamilies(candidates,records,recency,sigma){
  const scores=Array(4).fill(Infinity),sw=recency.reduce((a,b)=>a+b,0);
  for(const c of candidates)c.localWeight=0;
  for(let family=0;family<4;family++){
    const members=candidates.filter(c=>c.family===family&&c.valid);if(!members.length)continue;
    const minimum=Math.min(...members.map(c=>c.cost));let mass=0;
    for(const c of members){c.localWeight=Math.exp(-(c.cost-minimum)/(2*sigma*sigma));mass+=c.localWeight;}
    for(const c of members)c.localWeight/=mass;
    let score=0;
    for(let k=0;k<records.length;k++)for(let i=0;i<4;i++)for(let d=0;d<2;d++){
      const prediction=members.reduce((sum,c)=>sum+c.localWeight*c.predictions[k][i][d],0);
      score+=recency[k]*(prediction-records[k].pixels[i][d])**2/4;
    }
    scores[family]=score/sw;
  }
  return scores;
}
export class CandidateObserver {
  constructor(config={}) {this.config={...DEFAULTS,...config};this.history=[];this.rng=random(this.config.seed+117);this.candidates=[];this.randomRng=random(this.config.seed+100003);this.family=[0,0,0,0];this.familyScores=Array(4).fill(Infinity);this.familyCounts=[0,0,0,0];this.selectedFamily=-1;this.previousCircle=[];this.ready=false;}
  update(observation) {
    // Explicit schema boundary: no motion type, true target position/velocity,
    // frequency, actuator parameters or future samples are accepted here.
    const {time,pixels,camera}=observation;
    const center=[0,1].map(d=>(pixels.reduce((s,p)=>s+p[d],0)/4-SIZE[d]/2)/SCALE+camera[d]);
    this.history.push({time,pixels: pixels.map(p=>p.slice()),camera:camera.slice(),center});
    this.history=this.history.filter(r=>r.time>=time-this.config.history-1e-9);
    const records=this.history, times=records.map(r=>r.time-time), pos=records.map(r=>r.center);
    this.time=time;this.camera=camera.slice();this.center=center;
    const shortRandomOnly=this.config.counts.slice(0,3).every(n=>n===0)&&this.config.counts[3]>0&&this.config.history<4*H;
    if(records.length<(shortRandomOnly?2:3)){this.candidates=[];this.family=[0,0,0,0];this.familyCounts=[0,0,0,0];this.familyScores=Array(4).fill(Infinity);this.selectedFamily=-1;this.ready=false;return;}
    const weights=times.map(t=>Math.exp(t/.6)), sw=weights.reduce((a,b)=>a+b,0);
    const candidates=[], [nc,na,nr,randomCount=0]=this.config.counts;
    const cv=regression(times.map(t=>[1,t]),pos,weights,1e-6);
    for(let j=0;j<nc;j++){
      const v=cv.map(c=>c[1]+(j?this.rng.normal()*.001:0));
      const p=[0,1].map(d=>pos.reduce((s,y,k)=>s+weights[k]*(y[d]-v[d]*times[k]),0)/sw);
      candidates.push({family:0,p,v,a:[0,0]});
    }
    const ca=regression(times.map(t=>[1,t,.5*t*t]),pos,weights,1e-6);
    for(let j=0;j<na;j++){
      const a=ca.map(c=>c[2]+(j?this.rng.normal()*.05:0));
      const residual=pos.map((p,k)=>p.map((x,d)=>x-.5*a[d]*times[k]**2));
      const fit=regression(times.map(t=>[1,t]),residual,weights,1e-6);
      candidates.push({family:1,p:fit.map(c=>c[0]),v:fit.map(c=>c[1]),a});
    }
    if(records.length>=5){
      const ng=Math.floor(nr*.75), previous=this.previousCircle;
      const mass=previous.reduce((s,c)=>s+c.weight,0);
      for(let j=0;j<nr;j++){
        let f=.01+(j+this.rng.uniform())/Math.max(ng,1)*1.19;
        if(j>=ng){
          if(mass>1e-100){let u=this.rng.uniform()*mass,c=previous[previous.length-1];for(const p of previous){u-=p.weight;if(u<=0){c=p;break;}}f=clamp(c.frequency+.045*this.rng.normal(),.01,1.2);}
          else f=.01+this.rng.uniform()*1.19;
        }
        const w=2*Math.PI*f, basis=times.map(t=>[Math.cos(w*t)-1,Math.sin(w*t)]);
        const mx=[0,1].map(d=>basis.reduce((s,b,k)=>s+weights[k]*b[d],0)/sw);
        const my=[0,1].map(d=>pos.reduce((s,p,k)=>s+weights[k]*p[d],0)/sw);
        const cross=[0,1].map(d=>[0,1].map(b=>pos.reduce((s,p,k)=>s+weights[k]*(p[d]-my[d])*(basis[k][b]-mx[b]),0)));
        // 2-D orthogonal Procrustes, checking both circle directions.
        const rot=[cross[0][0]+cross[1][1],cross[1][0]-cross[0][1]], ref=[cross[0][0]-cross[1][1],cross[0][1]+cross[1][0]];
        const reflected=norm(ref)>norm(rot), pair=reflected?ref:rot, mag=norm(pair);
        const c=mag>0?pair[0]/mag:1,s=mag>0?pair[1]/mag:0;
        const q=reflected?[[c,s],[s,-c]]:[[c,-s],[s,c]];
        const den=basis.reduce((v,b,k)=>v+weights[k]*((b[0]-mx[0])**2+(b[1]-mx[1])**2),0)+1e-6*w*w+2e-5*w**4;
        const radius=mag/Math.max(den,1e-15), A=q.map(row=>radius*row[0]),B=q.map(row=>radius*row[1]);
        const p=my.map((x,d)=>x-A[d]*mx[0]-B[d]*mx[1]);
        candidates.push({family:2,p,v:mul(B,w),a:mul(A,-w*w),A,B,frequency:f});
      }
    }
    if((records.length>=5||shortRandomOnly)&&randomCount){
      const spacing=.15,first=-Math.ceil(-times[0]/spacing),last=Math.ceil(Math.max(.75,this.config.horizon*H)/spacing);
      const knots=Array.from({length:last-first+1},(_,i)=>(first+i)*spacing);
      for(let j=0;j<randomCount;j++){
        // Two frames identify velocity, but cannot identify acceleration.
        const acceleration=knots.map(()=>ca.map(c=>(records.length>=3?c[2]:0)+.15*this.randomRng.normal()));
        const integral=accelerationPath(knots,acceleration);
        const residual=pos.map((p,k)=>{const offset=integral(times[k]).p;return p.map((x,d)=>x-offset[d]);});
        const fit=regression(times.map(t=>[1,t]),residual,weights,1e-6);
        const candidate={family:3,p:fit.map(c=>c[0]),v:fit.map(c=>c[1]),a:acceleration[knots.findIndex(t=>t===0)],integral,knots,acceleration};
        // Conservative interval speed bound also covers between-knot extrema.
        candidate.pathValid=acceleration.every(a=>norm(a)<=8)&&knots.every((t,i)=>{
          const velocity=add(candidate.v,integral(t).v);
          return norm(velocity)+(i<knots.length-1?(knots[i+1]-t)*Math.max(norm(acceleration[i]),norm(acceleration[i+1])):0)<=1.2;
        });
        candidates.push(candidate);
      }
    }
    if(!candidates.length){this.candidates=[];this.family=[0,0,0,0];this.familyCounts=[0,0,0,0];this.familyScores=Array(4).fill(Infinity);this.selectedFamily=-1;this.ready=false;return;}
    let minimum=Infinity;
    for(const c of candidates){
      let cost=0;c.predictions=[];
      for(let k=0;k<records.length;k++){
        const predicted=project(this.position(c,times[k]),records[k].camera);
        c.predictions.push(predicted);
        cost+=weights[k]*predicted.reduce((s,p,i)=>s+(p[0]-records[k].pixels[i][0])**2+(p[1]-records[k].pixels[i][1])**2,0)/4;
      }
      c.cost=cost/sw;c.valid=norm(c.v)<=1.2&&norm(c.a)<=8&&c.pathValid!==false;
      if(c.valid)minimum=Math.min(minimum,c.cost);
    }
    // Preserve legacy circle-proposal adaptation using only the base bank.
    const base=candidates.filter(c=>c.family<3&&c.valid),baseMin=Math.min(...base.map(c=>c.cost));
    let baseMass=0;for(const c of base){c.proposalWeight=Math.exp(-(c.cost-baseMin)/(2*this.config.sigma**2));baseMass+=c.proposalWeight;}
    this.previousCircle=candidates.filter(c=>c.family===2).map(c=>({frequency:c.frequency,weight:baseMass?(c.proposalWeight||0)/baseMass:0}));
    this.familyScores=scoreFamilies(candidates,records,weights,this.config.sigma);
    this.familyCounts=Array.from({length:4},(_,g)=>candidates.filter(c=>c.family===g).length);
    this.family=[0,0,0,0];
    if(this.config.weighting==='global'){
      let total=0;for(const c of candidates){c.weight=c.valid?Math.exp(-(c.cost-minimum)/(2*this.config.sigma**2)):0;total+=c.weight;}
      for(const c of candidates){c.weight=total?c.weight/total:0;this.family[c.family]+=c.weight;}
      this.selectedFamily=-1;
    }else{
      this.selectedFamily=selectFamily(this.familyScores,this.selectedFamily);
      for(const c of candidates)c.weight=c.family===this.selectedFamily?c.localWeight:0;
      if(this.selectedFamily>=0)this.family[this.selectedFamily]=1;
    }
    this.candidates=candidates;this.ready=shortRandomOnly||records.length>=5;
  }
  position(c,t) {if(c.family===3){const p=c.integral(t).p;return c.p.map((x,d)=>x+c.v[d]*t+p[d]);}return c.family===2?c.p.map((x,d)=>x+c.A[d]*(Math.cos(2*Math.PI*c.frequency*t)-1)+c.B[d]*Math.sin(2*Math.PI*c.frequency*t)):c.p.map((x,d)=>x+c.v[d]*t+.5*c.a[d]*t*t);}
  velocity(c,t=0) {if(c.family===3)return add(c.v,c.integral(t).v);return c.family===2?c.p.map((_,d)=>2*Math.PI*c.frequency*(-c.A[d]*Math.sin(2*Math.PI*c.frequency*t)+c.B[d]*Math.cos(2*Math.PI*c.frequency*t))):c.v.map((x,d)=>x+c.a[d]*t);}
  current(){return this.candidates.reduce((s,c)=>add(s,mul(this.velocity(c),c.weight*SCALE)),[0,0]);}
  forecast(n,h=H){
    // Each interval uses the candidate pixel displacement / h; weights frozen.
    // Camera is fixed here; MPC contributes future camera motion separately.
    return Array.from({length:n},(_,i)=>this.candidates.reduce((s,c)=>add(s,this.position(c,(i+1)*h).map((x,d)=>(x-this.position(c,i*h)[d])*SCALE*c.weight/h)),[0,0]));
  }
}
// Recursive image-space baseline. All proposals start at the same previous
// measured pixels; the current measurement only scores their forward prediction.
export class RecursiveSDOB {
  constructor({seed=13,sigma=.25,adaptiveTemperature=true,etaMin=5,etaMax=10}={}) {
    if(!Number.isFinite(etaMin)||!Number.isFinite(etaMax)||etaMin<1||etaMax<=etaMin||etaMax>1000)throw new RangeError('Normalizer bounds must satisfy 1 <= etaMin < etaMax <= 1000');
    if(!Number.isFinite(sigma)||sigma<=0||!Number.isFinite(2*sigma*sigma)||2*sigma*sigma===0)throw new RangeError('Score scale must give a positive finite temperature');
    this.temperature=2*sigma*sigma;this.temperatureUsed=this.temperature;this.eta=0;this.effectiveSampleSize=0;
    this.config={history:H,sigma,adaptiveTemperature,etaMin,etaMax,weighting:'global'};this.rng=random(seed+100003);
    this.disturbance=Array.from({length:4},()=>[0,0]);this.history=[];
    this.candidates=[];this.family=[0,0,0,0];this.familyCounts=[0,0,0,0];
    this.familyScores=Array(4).fill(Infinity);this.selectedFamily=-1;this.ready=false;
  }
  update({time,pixels,camera}) {
    const record={time,pixels:pixels.map(p=>p.slice()),camera:camera.slice()};
    const previous=this.history.at(-1);
    this.history=[...(previous?[previous]:[]),record];
    // This reconstructed center is a drawing adapter only, never a score input.
    this.center=[0,1].map(d=>(pixels.reduce((s,p)=>s+p[d],0)/4-SIZE[d]/2)/SCALE+camera[d]);
    if(!previous)return;
    const dt=time-previous.time;
    if(!(dt>0))throw new RangeError('Observation times must increase');
    // Missing observations cannot be scored as a nominal 0.05-second transition.
    if(Math.abs(dt-H)>1e-8){this.candidates=[];this.ready=false;this.family=[0,0,0,0];this.familyCounts=[0,0,0,0];this.familyScores=Array(4).fill(Infinity);return;}
    const cameraDelta=camera.map((x,d)=>-SCALE*(x-previous.camera[d]));
    const candidates=[];
    for(let j=0;j<500;j++){
      const perturbation=Array.from({length:4},()=>[10*this.rng.normal(),10*this.rng.normal()]);
      for(const sign of [1,-1]){
        const disturbance=this.disturbance.map((p,i)=>p.map((x,d)=>x+sign*perturbation[i][d]));
        const predicted=previous.pixels.map((p,i)=>p.map((x,d)=>x+cameraDelta[d]+dt*disturbance[i][d]));
        const cost=predicted.reduce((sum,p,i)=>sum+p.reduce((s,x,d)=>s+(x-pixels[i][d])**2,0),0)/4;
        candidates.push({family:3,disturbance,predicted,cost,valid:true});
      }
    }
    const minimum=Math.min(...candidates.map(c=>c.cost));
    const temperature=this.temperature;let eta=0;
    for(const c of candidates){c.weight=Math.exp(-(c.cost-minimum)/temperature);eta+=c.weight;}
    for(const c of candidates)c.weight/=eta;
    this.temperatureUsed=temperature;this.eta=eta;
    this.effectiveSampleSize=1/candidates.reduce((sum,c)=>sum+c.weight*c.weight,0);
    // https://github.com/tud-airlab/mppi_torch/blob/0c89578a4f3b6281bd3492962739cfeefd0c568b/mppi_torch/mppi.py#L293-L323
    // Biased-MPPI normalizer adaptation: current weights use current lambda;
    // update once for the next observation, retaining temperature across steps.
    if(this.config.adaptiveTemperature){
      const factor=eta>this.config.etaMax?.9:eta<this.config.etaMin?1.2:1;
      this.temperature=Math.max(Number.MIN_VALUE,Math.min(Number.MAX_VALUE,temperature*factor));
    }
    this.disturbance=Array.from({length:4},(_,i)=>[0,1].map(d=>candidates.reduce((sum,c)=>sum+c.weight*c.disturbance[i][d],0)));
    this.candidates=candidates;this.family=[0,0,0,1];this.familyCounts=[0,0,0,1000];this.ready=true;
    this.familyScores=[Infinity,Infinity,Infinity,candidates.reduce((s,c)=>s+c.weight*c.cost,0)];
  }
  // The planar teaching controller uses the mean of the four corner estimates.
  // Keep the separate corner disturbances above; no rigid-motion fit is applied.
  current(){return [0,1].map(d=>this.disturbance.reduce((sum,p)=>sum+p[d],0)/4);}
  forecast(n){return Array.from({length:n},()=>this.current());}
  position(c,t){return this.center.map((x,d)=>x+t*c.disturbance.reduce((sum,p)=>sum+p[d],0)/(4*SCALE));}
}
export class FirstOrderDOB {
  constructor(gain=10){this.gain=gain;this.value=[0,0];this.previous=null;}
  update({time,pixels,camera}){
    const m=[0,1].map(d=>pixels.reduce((s,p)=>s+p[d],0)/4);
    if(this.previous){const dt=time-this.previous.time,alpha=dt*this.gain/(1+dt*this.gain);this.value=this.value.map((v,d)=>(1-alpha)*v+alpha*((m[d]-this.previous.m[d])+SCALE*(camera[d]-this.previous.camera[d]))/dt);}
    this.previous={time,m,camera:camera.slice()};return this.value.slice();
  }
}
export class ResponseIdentifier {
  constructor(){this.history=[];this.tau=.06;this.gain=1;this.identified=false;this.cost=0;}
  update(time,q,command){
    this.history.push({time,q:q.slice(),command:command.slice()});
    this.history=this.history.filter(r=>r.time>=time-1.5-1e-9);
    const r=this.history;if(r.length<7)return;
    let excitation=0;for(let k=1;k<r.length;k++)excitation+=norm(r[k].command.map((x,d)=>x-r[k-1].command[d]))**2;
    if(excitation<1e-7)return;
    let best={cost:Infinity};
    for(let j=0;j<81;j++){
      const tau=.015*Math.pow(.4/.015,j/80),a=Math.exp(-H/tau),b=tau*(1-a)/H;
      const pairs=[];let numerator=0,denominator=0;
      for(let k=2;k<r.length;k++)for(let d=0;d<2;d++){
        const y=(r[k].q[d]-r[k-1].q[d])/H-a*(r[k-1].q[d]-r[k-2].q[d])/H;
        const x=(1-b)*r[k].command[d]+(b-a)*r[k-1].command[d],w=Math.exp((r[k].time-time)/.6);
        pairs.push([x,y,w]);numerator+=w*x*y;denominator+=w*x*x;
      }
      const gain=clamp(numerator/Math.max(denominator,1e-12),.5,1.4);
      const cost=pairs.reduce((s,[x,y,w])=>s+w*(y-gain*x)**2,0);
      if(cost<best.cost)best={tau,gain,cost};
    }
    if(Number.isFinite(best.cost)){Object.assign(this,best);this.identified=true;}
  }
  endpoint(){const r=this.history,n=r.length;if(n<2)return [0,0];const a=Math.exp(-H/this.tau),b=this.tau*(1-a)/H;return r[n-1].q.map((x,d)=>a/b*(x-r[n-2].q[d])/H+this.gain*(1-a/b)*r[n-1].command[d]);}
}
// Projection onto speed and successive-command bounds. Repeated pairwise
// projections followed by a causal pass ensure a feasible returned sequence.
export function projectCommands(input,previous,maxSpeed=.3,maxChange=.04){
  const x=input.map(v=>clamp(v,-maxSpeed,maxSpeed));
  for(let pass=0;pass<12;pass++){
    x[0]=clamp(x[0],Math.max(-maxSpeed,previous-maxChange),Math.min(maxSpeed,previous+maxChange));
    for(let i=1;i<x.length;i++){
      const diff=x[i]-x[i-1],excess=Math.max(0,Math.abs(diff)-maxChange)*Math.sign(diff)/2;
      x[i]-=excess;x[i-1]+=excess;
    }
    for(let i=0;i<x.length;i++)x[i]=clamp(x[i],-maxSpeed,maxSpeed);
  }
  for(let i=0;i<x.length;i++){const p=i?x[i-1]:previous;x[i]=clamp(x[i],Math.max(-maxSpeed,p-maxChange),Math.min(maxSpeed,p+maxChange));}
  return x;
}
export class PredictiveController {
  constructor(n=12){this.n=n;this.warm=[zeros(n),zeros(n)];this.plan=[];}
  command(errorPx,velocity,forecast,tau,gain,previous){
    const n=this.n,a=Math.exp(-H/tau),b=tau*(1-a)/H,mat=Array.from({length:n},()=>zeros(n));
    for(let j=0;j<n;j++){let q=0,v=0;for(let k=0;k<n;k++){const u=k===j?1:0;q+=H*(b*v+gain*(1-b)*u);v=a*v+gain*(1-a)*u;mat[k][j]=q;}}
    const free=[];let vcoef=1,qcoef=0;for(let k=0;k<n;k++){qcoef+=H*b*vcoef;vcoef*=a;free.push(qcoef);}
    const result=[[],[]],plan=[[],[]];
    for(let axis=0;axis<2;axis++){
      let sum=0;const target=forecast.map((d,k)=>{sum+=H*d[axis]/SCALE;return errorPx[axis]/SCALE+sum-free[k]*velocity[axis];});
      const stage=Array.from({length:n},(_,i)=>i===n-1?3:1),smooth=.012,magnitude=.0002,margin=(SIZE[axis]/2-12)/SCALE-MARKER_SIDE/2,slack=30;
      const valueGradient=u=>{
        let value=0;const gradient=zeros(n);
        for(let k=0;k<n;k++){
          const e=target[k]-dot(mat[k],u),outside=Math.sign(e)*Math.max(0,Math.abs(e)-margin);
          value+=stage[k]*e*e+slack*outside*outside;
          for(let j=0;j<n;j++)gradient[j]-=2*mat[k][j]*(stage[k]*e+slack*outside);
          const delta=u[k]-(k?u[k-1]:previous[axis]);value+=smooth*delta*delta+magnitude*u[k]*u[k];
          gradient[k]+=2*smooth*delta+2*magnitude*u[k];if(k)gradient[k-1]-=2*smooth*delta;
        }
        return {value,gradient};
      };
      let u=projectCommands([...this.warm[axis].slice(1),this.warm[axis].at(-1)],previous[axis]),step=1;
      for(let iteration=0;iteration<55;iteration++){
        const {value,gradient}=valueGradient(u);let candidate;
        for(let trial=0;trial<10;trial++){
          candidate=projectCommands(u.map((x,j)=>x-step*gradient[j]),previous[axis]);
          if(valueGradient(candidate).value<=value+1e-12)break;step*=.5;
        }
        const change=norm(candidate.map((x,i)=>x-u[i]));u=candidate;step=Math.min(step*1.1,4);if(change<1e-7)break;
      }
      result[axis]=u;plan[axis]=target.map((x,k)=>(x-dot(mat[k],u))*SCALE);this.warm[axis]=u;
    }
    this.plan=Array.from({length:n},(_,i)=>[320+plan[0][i],180+plan[1][i]]);
    return [result[0][0],result[1][0]];
  }
}
export class Simulation {
  constructor(config={}){
    this.config={...DEFAULTS,...config};
    // SDOB samples image disturbances; trajectory-prior groups belong to RA-SDOB.
    this.config.counts=this.config.method==='sdob'?[0,0,0,1000]:[...this.config.counts];
    if(this.config.method==='sdob'){
      this.config.weighting='global';
      this.config.history=H;
    }
    this.t=0;this.q=[0,0];this.v=[0,0];this.command=[0,0];this.offset=[0,0];this.rng=random(this.config.seed);
    // Only estimator settings cross the boundary; true trajectory never does.
    this.observer=this.config.method==='sdob'?new RecursiveSDOB({sigma:this.config.sigma,seed:this.config.seed,adaptiveTemperature:this.config.adaptiveTemperature,etaMin:this.config.etaMin,etaMax:this.config.etaMax}):new CandidateObserver({history:this.config.history,sigma:this.config.sigma,seed:this.config.seed,counts:this.config.counts,weighting:this.config.weighting,horizon:this.config.horizon});
    this.dob=new FirstOrderDOB(this.config.gain);this.response=new ResponseIdentifier();this.mpc=new PredictiveController(this.config.horizon);
    this.records=[];this.sample();
  }
  sample(){
    const target=targetAt(this.t,this.config);target.p=add(target.p,this.offset);
    const clean=project(target.p,this.q),pixels=clean.map(p=>p.map(x=>x+this.config.noise*this.rng.normal())),qMeasured=this.q.map(x=>x+1e-6*this.rng.normal());
    const observation={time:this.t,pixels,camera:qMeasured};
    const visible=clean.every(p=>p[0]>=0&&p[0]<=640&&p[1]>=0&&p[1]<=360);
    if(visible){this.observer.update(observation);this.dob.update(observation);}
    this.response.update(this.t,qMeasured,this.command);
    const estimated=this.observer.current(),dob=this.dob.value.slice(),truth=mul(target.v,SCALE);
    const center=pixels.reduce((v,p)=>add(v,mul(p,.25)),[0,0]),error=center.map((x,d)=>x-SIZE[d]/2);
    let command=[0,0];
    if(this.config.mode==='estimate')command=[.018*Math.sin(1.7*this.t),.012*Math.sin(2.3*this.t)];
    else if(visible){
      const adaptive=this.config.method==='ra',tau=adaptive?this.response.tau:.06,gain=adaptive?this.response.gain:1;
      const forecast=this.config.method==='mpc'?Array.from({length:this.config.horizon},()=>[0,0]):this.config.method==='dob'?Array.from({length:this.config.horizon},()=>dob):this.observer.forecast(this.config.horizon);
      const records=this.response.history,interval=records.length>1?qMeasured.map((x,d)=>(x-records.at(-2).q[d])/H):[0,0];
      const a=Math.exp(-H/tau),b=tau*(1-a)/H,endpoint=interval.map((x,d)=>a/b*x+gain*(1-a/b)*this.command[d]);
      command=this.mpc.command(error,endpoint,forecast,tau,gain,this.command);
    }
    const desired=project([0,0]);
    const tracking=Math.sqrt(clean.reduce((s,p,i)=>s+norm(p.map((x,d)=>x-desired[i][d]))**2,0)/4);
    const record={t:this.t,truth,estimated,dob,tracking,estimateError:norm(estimated.map((x,i)=>x-truth[i])),dobError:norm(dob.map((x,i)=>x-truth[i])),tau:this.response.tau,gain:this.response.gain,identified:this.response.identified,visible,target:target.p.slice(),camera:this.q.slice(),velocity:this.v.slice(),command:command.slice(),pixels,clean,family:this.observer.family.slice(),familyScores:this.observer.familyScores.slice(),selectedFamily:this.observer.selectedFamily,familyCounts:this.observer.familyCounts.slice(),candidates:this.observer.candidates.length,plan:this.mpc.plan.map(p=>p.slice())};
    this.command=command;this.records.push(record);this.latest=record;return record;
  }
  step(){if(this.t>=this.config.duration-1e-9)return this.latest;const state=responseStep(this.q,this.v,this.command,this.config.tau,this.config.plantGain);this.q=state.q;this.v=state.v;this.t=Math.round((this.t+H)*1e8)/1e8;return this.sample();}
  disturb(){this.offset=add(this.offset,[.035,-.02]);}
  metrics(window='settled'){
    const start=window==='full'?0:this.config.motion==='line'?1.25:4;
    const end=this.config.motion==='line'?Math.min(this.config.duration,.2/this.config.speed):this.config.duration;
    const records=this.records.filter(r=>r.t>=start-1e-9&&r.t<end-1e-9);
    if(!records.length)return {count:0,start,end,estimate:null,dob:null,tracking:null};
    const rms=k=>Math.sqrt(records.reduce((s,r)=>s+r[k]**2,0)/records.length);
    return {count:records.length,start,end,estimate:rms('estimateError'),dob:rms('dobError'),tracking:rms('tracking'),visible:records.filter(r=>r.visible).length/records.length};
  }
}
