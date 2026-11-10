// Three-axis browser teaching model. Optical coordinates: x right, y down,
// z away from the camera. Target orientation is fixed; depth is image-derived.
import {H,FOCAL,DEPTH,SCALE,SIZE,MARKER_SIDE,DEFAULTS,clamp,norm,random,
  responseStep,regression,accelerationPath,scoreFamilies,selectFamily,
  RecursiveSDOB,ResponseIdentifier,projectCommands} from './engine.mjs?v=20261110sim3d';

const zeroCorners=()=>Array.from({length:4},()=>[0,0]);
const meanCorners=c=>[0,1].map(d=>c.reduce((s,p)=>s+p[d]/4,0));
const cornerError=(a,b)=>Math.sqrt(a.reduce((s,p,i)=>s+p.reduce((v,x,d)=>v+(x-b[i][d])**2,0),0)/4);
const offsets=[[-1,-1],[1,-1],[1,1],[-1,1]].map(p=>p.map(x=>x*MARKER_SIDE/2));
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const add=(a,b)=>a.map((x,i)=>x+b[i]);

export function projectSpatial(center,camera=[0,0,0]){
  const depth=DEPTH+center[2]-camera[2];
  if(!(depth>0))throw new RangeError('Marker must remain in front of the camera');
  return offsets.map(o=>[0,1].map(d=>SIZE[d]/2+FOCAL*(center[d]+o[d]-camera[d])/depth));
}

export function reconstructSpatial(pixels,camera=[0,0,0]){
  // Known facing-square geometry; both horizontal and vertical sides contribute.
  const side=(pixels[1][0]+pixels[2][0]-pixels[0][0]-pixels[3][0]
    +pixels[2][1]+pixels[3][1]-pixels[0][1]-pixels[1][1])/4;
  if(!(side>0))throw new RangeError('Invalid marker corner order or size');
  const depth=FOCAL*MARKER_SIDE/side,mean=meanCorners(pixels);
  return {depth,center:[...mean.map((x,d)=>camera[d]+(x-SIZE[d]/2)*depth/FOCAL),camera[2]+depth-DEPTH]};
}

export function spatialTargetAt(t,{frequency=.4,radius=.04}={}){
  const w=2*Math.PI*frequency,s=w*Math.max(t,0);
  return {p:[radius*(Math.cos(s)-1),radius*Math.sin(2*s),radius*Math.sin(s)],
    v:t<0?[0,0,0]:[-radius*w*Math.sin(s),2*radius*w*Math.cos(2*s),radius*w*Math.cos(s)]};
}

export function imageVelocity(center,velocity,camera){
  const pixels=projectSpatial(center,camera),depth=DEPTH+center[2]-camera[2];
  return pixels.map(p=>p.map((x,d)=>(FOCAL*velocity[d]-(x-SIZE[d]/2)*velocity[2])/depth));
}

export function cameraImageDisplacement(previous,camera){
  const {center}=reconstructSpatial(previous.pixels,previous.camera);
  const before=projectSpatial(center,previous.camera),after=projectSpatial(center,camera);
  return after.map((p,i)=>p.map((x,d)=>x-before[i][d]));
}

export function cameraJacobian(pixels,depth){
  return pixels.flatMap(p=>[[-FOCAL/depth,0,(p[0]-SIZE[0]/2)/depth],
    [0,-FOCAL/depth,(p[1]-SIZE[1]/2)/depth]]);
}

// Four predicted interval disturbances, then the fourth held through step 12.
export function holdDisturbance(forecast,horizon=12){
  if(!forecast.length)throw new RangeError('A forecast needs at least one step');
  return Array.from({length:horizon},(_,i)=>forecast[Math.min(i,forecast.length-1)].map(p=>p.slice()));
}

export class SpatialCandidateObserver {
  constructor({history=.75,sigma=.25,seed=13,counts=DEFAULTS.counts,horizon=12,periodicHistory=3.5}={}){
    this.config={history,sigma,seed,counts:[...counts],horizon,periodicHistory};
    this.history=[];this.rng=random(seed+117);this.randomRng=random(seed+100003);
    this.candidates=[];this.family=[0,0,0,0];this.familyCounts=[0,0,0,0];
    this.familyScores=Array(4).fill(Infinity);this.selectedFamily=-1;this.previousPeriodic=[];this.ready=false;
    this.center=[0,0,0];this.camera=[0,0,0];
  }
  update({time,pixels,camera}){
    // No trajectory type, target frequency, true depth or future data enter here.
    const {center}=reconstructSpatial(pixels,camera);
    this.center=center;this.camera=camera.slice();this.time=time;
    this.history.push({time,pixels:pixels.map(p=>p.slice()),camera:camera.slice(),center});
    this.history=this.history.filter(r=>r.time>=time-Math.max(this.config.history,this.config.periodicHistory)-1e-9);
    const records=this.history.filter(r=>r.time>=time-this.config.history-1e-9);
    this.candidates=[];this.family=[0,0,0,0];this.familyCounts=[0,0,0,0];this.familyScores=Array(4).fill(Infinity);this.ready=false;
    if(records.length<3){this.selectedFamily=-1;return;}
    const times=records.map(r=>r.time-time),pos=records.map(r=>r.center),weights=times.map(t=>Math.exp(t/.6));
    const [nc,na,np,nr=0]=this.config.counts,candidates=[];
    const cv=regression(times.map(t=>[1,t]),pos,weights,1e-6);
    const ca=regression(times.map(t=>[1,t,.5*t*t]),pos,weights,1e-6);
    for(let j=0;j<nc;j++){
      const v=cv.map(c=>c[1]+(j?this.rng.normal()*.001:0));
      const fit=regression(times.map(()=>[1]),pos.map((p,k)=>p.map((x,d)=>x-v[d]*times[k])),weights);
      candidates.push({family:0,p:fit.map(c=>c[0]),v,a:[0,0,0]});
    }
    for(let j=0;j<na;j++){
      const a=ca.map(c=>c[2]+(j?this.rng.normal()*.05:0));
      const fit=regression(times.map(t=>[1,t]),pos.map((p,k)=>p.map((x,d)=>x-.5*a[d]*times[k]**2)),weights,1e-6);
      candidates.push({family:1,p:fit.map(c=>c[0]),v:fit.map(c=>c[1]),a});
    }
    // Generic periodic priors fit every axis; no assignment of f or 2f to axes.
    // A longer measured history resolves periods without knowing the target rate.
    const periodic=this.history,pt=periodic.map(r=>r.time-time),pw=pt.map(t=>Math.exp(t/1.5));
    if(periodic.length>=13){
      for(const harmonics of [1,2]){
        const count=harmonics===1?Math.floor(np/2):np-Math.floor(np/2),grid=Math.ceil(count*.75);
        const previous=this.previousPeriodic.filter(c=>c.harmonics===harmonics),mass=previous.reduce((s,c)=>s+c.weight,0);
        for(let j=0;j<count;j++){
          let frequency=.01+(j+this.rng.uniform())/grid*1.19;
          if(j>=grid){
            frequency=.01+1.19*this.rng.uniform();
            if(mass>1e-100){let u=this.rng.uniform()*mass,pick=previous.at(-1);for(const c of previous){u-=c.weight;if(u<=0){pick=c;break;}}frequency=clamp(pick.frequency+.012*this.rng.normal(),.01,1.2);}
          }
          const w=2*Math.PI*frequency,basis=t=>[1,...Array.from({length:harmonics},(_,i)=>[Math.cos((i+1)*w*t)-1,Math.sin((i+1)*w*t)]).flat()];
          const fit=regression(pt.map(basis),periodic.map(r=>r.center),pw,1e-5);
          const c={family:2,p:fit.map(b=>b[0]),fit,frequency,harmonics};
          c.v=this.velocity(c);c.a=fit.map(b=>Array.from({length:harmonics},(_,i)=>-(((i+1)*w)**2)*b[1+2*i]).reduce((a,b)=>a+b,0));
          candidates.push(c);
        }
      }
    }
    if(records.length>=5){
      const spacing=.15,first=-Math.ceil(-times[0]/spacing),last=Math.ceil(Math.max(.75,this.config.horizon*H)/spacing);
      const knots=Array.from({length:last-first+1},(_,i)=>(first+i)*spacing);
      for(let j=0;j<nr;j++){
        const acceleration=knots.map(()=>ca.map(c=>c[2]+.15*this.randomRng.normal()));
        const integral=accelerationPath(knots,acceleration);
        const fit=regression(times.map(t=>[1,t]),pos.map((p,k)=>p.map((x,d)=>x-integral(times[k]).p[d])),weights,1e-6);
        candidates.push({family:3,p:fit.map(c=>c[0]),v:fit.map(c=>c[1]),a:acceleration[-first],integral,
          pathValid:acceleration.every(a=>norm(a)<=8)&&knots.every(t=>norm(add(fit.map(c=>c[1]),integral(t).v))<=1.2)});
      }
    }
    const sw=weights.reduce((s,x)=>s+x,0);
    for(const c of candidates){
      c.valid=norm(c.v)<=1.2&&norm(c.a)<=8&&c.pathValid!==false;
      const positions=times.map(t=>this.position(c,t));
      c.valid&&=positions.every((p,i)=>DEPTH+p[2]-records[i].camera[2]>.08)
        &&Array.from({length:5},(_,i)=>DEPTH+this.position(c,i*H)[2]-camera[2]).every(z=>z>.08);
      c.predictions=c.valid?positions.map((p,k)=>projectSpatial(p,records[k].camera)):[];
      c.cost=c.valid?c.predictions.reduce((s,p,k)=>s+weights[k]*cornerError(p,records[k].pixels)**2,0)/sw:Infinity;
    }
    this.familyScores=scoreFamilies(candidates,records,weights,this.config.sigma);
    this.selectedFamily=selectFamily(this.familyScores,this.selectedFamily);
    for(const c of candidates)c.weight=c.family===this.selectedFamily?c.localWeight:0;
    this.previousPeriodic=candidates.filter(c=>c.family===2&&c.valid).map(c=>({frequency:c.frequency,harmonics:c.harmonics,weight:c.localWeight}));
    this.familyCounts=Array.from({length:4},(_,f)=>candidates.filter(c=>c.family===f).length);
    if(this.selectedFamily>=0)this.family[this.selectedFamily]=1;
    this.candidates=candidates;this.ready=this.selectedFamily>=0;
  }
  position(c,t){
    if(c.family===2){const w=2*Math.PI*c.frequency;return c.fit.map(b=>b[0]+Array.from({length:c.harmonics},(_,i)=>b[1+2*i]*(Math.cos((i+1)*w*t)-1)+b[2+2*i]*Math.sin((i+1)*w*t)).reduce((a,b)=>a+b,0));}
    if(c.family===3)return c.p.map((x,d)=>x+c.v[d]*t+c.integral(t).p[d]);
    return c.p.map((x,d)=>x+c.v[d]*t+.5*c.a[d]*t*t);
  }
  velocity(c,t=0){
    if(c.family===2){const w=2*Math.PI*c.frequency;return c.fit.map(b=>Array.from({length:c.harmonics},(_,i)=>(i+1)*w*(-b[1+2*i]*Math.sin((i+1)*w*t)+b[2+2*i]*Math.cos((i+1)*w*t))).reduce((a,b)=>a+b,0));}
    if(c.family===3)return add(c.v,c.integral(t).v);
    return c.v.map((x,d)=>x+c.a[d]*t);
  }
  currentCorners(){
    const result=zeroCorners();
    for(const c of this.candidates){if(!c.weight)continue;const v=imageVelocity(this.position(c,0),this.velocity(c),this.camera);for(let i=0;i<4;i++)for(let d=0;d<2;d++)result[i][d]+=c.weight*v[i][d];}
    return result;
  }
  current(){return meanCorners(this.currentCorners());}
  forecast(n,h=H){
    return Array.from({length:n},(_,k)=>{
      const result=zeroCorners();
      for(const c of this.candidates){if(!c.weight)continue;const before=projectSpatial(this.position(c,k*h),this.camera),after=projectSpatial(this.position(c,(k+1)*h),this.camera);for(let i=0;i<4;i++)for(let d=0;d<2;d++)result[i][d]+=c.weight*(after[i][d]-before[i][d])/h;}
      return result;
    });
  }
}

export class SpatialSDOB extends RecursiveSDOB {
  reconstruct(pixels,camera){return reconstructSpatial(pixels,camera).center;}
  cameraDisplacement(previous,camera){return cameraImageDisplacement(previous,camera);}
  forecast(n){return Array.from({length:n},()=>this.currentCorners());}
  position(c,t){const pixels=projectSpatial(this.center,this.history.at(-1).camera);return reconstructSpatial(pixels.map((p,i)=>p.map((x,d)=>x+t*c.disturbance[i][d])),this.history.at(-1).camera).center;}
}

export class SpatialDOB {
  constructor(gain=10){this.gain=gain;this.disturbance=zeroCorners();this.previous=null;}
  update({time,pixels,camera}){
    if(this.previous){
      const dt=time-this.previous.time,alpha=dt*this.gain/(1+dt*this.gain),delta=cameraImageDisplacement(this.previous,camera);
      this.disturbance=this.disturbance.map((p,i)=>p.map((x,d)=>(1-alpha)*x+alpha*(pixels[i][d]-this.previous.pixels[i][d]-delta[i][d])/dt));
    }
    this.previous={time,pixels:pixels.map(p=>p.slice()),camera:camera.slice()};
  }
  currentCorners(){return this.disturbance.map(p=>p.slice());}
}

export class SpatialController {
  constructor(n=12){this.n=n;this.warm=Array.from({length:3},()=>Array(n).fill(0));this.plan=[];this.planCorners=[];}
  command(pixels,depth,velocity,forecast,tau,gain,previous){
    const n=this.n,a=Math.exp(-H/tau),b=tau*(1-a)/H,mat=Array.from({length:n},()=>Array(n).fill(0));
    for(let j=0;j<n;j++){let q=0,v=0;for(let k=0;k<n;k++){const u=k===j?1:0;q+=H*(b*v+gain*(1-b)*u);v=a*v+gain*(1-a)*u;mat[k][j]=q;}}
    const free=[];let vcoef=1,qcoef=0;for(let k=0;k<n;k++){qcoef+=H*b*vcoef;vcoef*=a;free.push(qcoef);}
    const jacobian=cameraJacobian(pixels,depth).map(row=>row.map(x=>x/SCALE)),desired=projectSpatial([0,0,0]).flat();
    let cumulative=Array(8).fill(0);
    const target=forecast.map((corners,k)=>{cumulative=cumulative.map((x,i)=>x+H*corners.flat()[i]);return pixels.flat().map((x,i)=>(x-desired[i]+cumulative[i])/SCALE+dot(jacobian[i],velocity)*free[k]);});
    const smooth=.012,magnitude=.0002,slack=30;
    const evaluate=(u,withGradient=true)=>{
      const gradient=Array.from({length:3},()=>Array(n).fill(0)),predictions=[];let value=0;
      for(let k=0;k<n;k++){
        const displacement=u.map(axis=>dot(mat[k],axis)),g=[0,0,0],prediction=[];
        for(let i=0;i<8;i++){
          const error=target[k][i]+dot(jacobian[i],displacement),pixel=desired[i]+error*SCALE;
          const outside=pixel<12?(pixel-12)/SCALE:pixel>SIZE[i%2]-12?(pixel-(SIZE[i%2]-12))/SCALE:0;
          const stage=k===n-1?3:1;value+=(stage*error**2+slack*outside**2)/4;prediction.push(pixel);
          if(withGradient)for(let d=0;d<3;d++)g[d]+=(stage*error+slack*outside)*jacobian[i][d]/2;
        }
        predictions.push(Array.from({length:4},(_,i)=>prediction.slice(i*2,i*2+2)));
        for(let d=0;d<3;d++){
          if(withGradient)for(let j=0;j<n;j++)gradient[d][j]+=mat[k][j]*g[d];
          const delta=u[d][k]-(k?u[d][k-1]:previous[d]);value+=smooth*delta**2+magnitude*u[d][k]**2;
          if(withGradient){gradient[d][k]+=2*smooth*delta+2*magnitude*u[d][k];if(k)gradient[d][k-1]-=2*smooth*delta;}
        }
      }
      return {value,gradient,predictions};
    };
    let u=this.warm.map((axis,d)=>projectCommands([...axis.slice(1),axis.at(-1)],previous[d])),step=1;
    for(let iteration=0;iteration<55;iteration++){
      const {value,gradient}=evaluate(u);let candidate,accepted=false;
      for(let trial=0;trial<12;trial++){
        candidate=u.map((axis,d)=>projectCommands(axis.map((x,j)=>x-step*gradient[d][j]),previous[d]));
        if(evaluate(candidate,false).value<=value+1e-12){accepted=true;break;}step*=.5;
      }
      if(!accepted)break;
      const change=norm(candidate.flat().map((x,i)=>x-u.flat()[i]));u=candidate;step=Math.min(step*1.1,4);if(change<1e-7)break;
    }
    this.warm=u;this.planCorners=evaluate(u,false).predictions;this.plan=this.planCorners.map(meanCorners);
    return u.map(axis=>axis[0]);
  }
}

export class SpatialSimulation {
  constructor(config={}){
    this.config={...DEFAULTS,...config,motion:'spatial'};
    if(this.config.method==='sdob'){this.config.history=H;this.config.counts=[0,0,0,1000];}
    this.t=0;this.q=[0,0,0];this.v=[0,0,0];this.command=[0,0,0];this.rng=random(this.config.seed);
    // Pass only estimator parameters, never the target trajectory configuration.
    const {history,sigma,seed,counts,horizon,gain}=this.config;
    this.observer=this.config.method==='sdob'?new SpatialSDOB({seed,sigma}):new SpatialCandidateObserver({history,sigma,seed,counts,horizon});
    this.dob=new SpatialDOB(gain);this.response=new ResponseIdentifier();this.mpc=new SpatialController(horizon);
    this.records=[];this.sample();
  }
  sample(){
    const target=spatialTargetAt(this.t,this.config),clean=projectSpatial(target.p,this.q);
    const pixels=clean.map(p=>p.map(x=>x+this.config.noise*this.rng.normal())),camera=this.q.map(x=>x+1e-6*this.rng.normal());
    const observation={time:this.t,pixels,camera},visible=clean.every(p=>p.every((x,d)=>x>=0&&x<=SIZE[d]));
    if(visible){this.observer.update(observation);this.dob.update(observation);}
    this.response.update(this.t,camera,this.command);
    const estimatedCorners=this.observer.currentCorners(),dobCorners=this.dob.currentCorners(),truthCorners=imageVelocity(target.p,target.v,this.q);
    const {depth}=reconstructSpatial(pixels,camera);let command=[0,0,0];
    if(this.config.mode==='estimate')command=[.018*Math.sin(1.7*this.t),.012*Math.sin(2.3*this.t),.01*Math.sin(1.3*this.t)];
    else if(visible){
      const adaptive=this.config.method==='ra',tau=adaptive?this.response.tau:.06,gain=adaptive?this.response.gain:1;
      const short=this.config.method==='mpc'?[zeroCorners()]:this.config.method==='dob'?[dobCorners]:this.observer.forecast(Math.min(4,this.config.horizon));
      const forecast=holdDisturbance(short,this.config.horizon);this.lastForecast=forecast;
      const records=this.response.history,interval=records.length>1?camera.map((x,d)=>(x-records.at(-2).q[d])/H):[0,0,0];
      const a=Math.exp(-H/tau),b=tau*(1-a)/H,endpoint=interval.map((x,d)=>a/b*x+gain*(1-a/b)*this.command[d]);
      command=this.mpc.command(pixels,depth,endpoint,forecast,tau,gain,this.command);
    }
    const r={t:this.t,truth:meanCorners(truthCorners),estimated:meanCorners(estimatedCorners),dob:meanCorners(dobCorners),
      truthCorners,estimatedCorners,dobCorners,tracking:cornerError(clean,projectSpatial([0,0,0])),
      estimateError:cornerError(estimatedCorners,truthCorners),dobError:cornerError(dobCorners,truthCorners),
      depth,desiredDepth:DEPTH,tau:this.response.tau,gain:this.response.gain,identified:this.response.identified,visible,
      target:target.p.slice(),camera:this.q.slice(),velocity:this.v.slice(),command:command.slice(),pixels,clean,
      family:this.observer.family.slice(),familyCounts:this.observer.familyCounts.slice(),familyScores:this.observer.familyScores.slice(),
      selectedFamily:this.observer.selectedFamily,candidates:this.observer.candidates.length,
      plan:this.mpc.plan.map(p=>p.slice()),planCorners:this.mpc.planCorners.map(c=>c.map(p=>p.slice()))};
    this.command=command;this.records.push(r);this.latest=r;return r;
  }
  step(){if(this.t>=this.config.duration-1e-9)return this.latest;const state=responseStep(this.q,this.v,this.command,this.config.tau,this.config.plantGain);this.q=state.q;this.v=state.v;this.t=Math.round((this.t+H)*1e8)/1e8;return this.sample();}
  metrics(window='settled'){
    const start=window==='full'?0:4,end=this.config.duration,records=this.records.filter(r=>r.t>=start-1e-9&&r.t<end-1e-9);
    if(!records.length)return {count:0,start,end,estimate:null,dob:null,tracking:null};
    const rms=key=>Math.sqrt(records.reduce((s,r)=>s+r[key]**2,0)/records.length);
    return {count:records.length,start,end,estimate:rms('estimateError'),dob:rms('dobError'),tracking:rms('tracking'),visible:records.filter(r=>r.visible).length/records.length};
  }
}
