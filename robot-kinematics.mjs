/** Rigid-body FK for the exported Astribot MJCF. Matrices are column-major. */
export const identity = () => new Float64Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
export const dot = (a,b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
export const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const sub = (a,b) => a.map((x,i)=>x-b[i]);
export const length = a => Math.hypot(...a);
export const normalize = a => {const n=length(a)||1;return a.map(x=>x/n);};
export function multiply(a,b) {
  const out=new Float64Array(16);
  for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)out[c*4+r]+=a[k*4+r]*b[c*4+k];
  return out;
}
export function transform(pos=[0,0,0],quat=[1,0,0,0]) {
  const norm=Math.hypot(...quat)||1,[w,x,y,z]=quat.map(v=>v/norm),m=identity();
  m[0]=1-2*(y*y+z*z);m[1]=2*(x*y+z*w);m[2]=2*(x*z-y*w);
  m[4]=2*(x*y-z*w);m[5]=1-2*(x*x+z*z);m[6]=2*(y*z+x*w);
  m[8]=2*(x*z+y*w);m[9]=2*(y*z-x*w);m[10]=1-2*(x*x+y*y);
  m[12]=pos[0];m[13]=pos[1];m[14]=pos[2];return m;
}
export function point(m,v=[0,0,0]) {return [m[0]*v[0]+m[4]*v[1]+m[8]*v[2]+m[12],m[1]*v[0]+m[5]*v[1]+m[9]*v[2]+m[13],m[2]*v[0]+m[6]*v[1]+m[10]*v[2]+m[14]];}
export function vector(m,v) {return [m[0]*v[0]+m[4]*v[1]+m[8]*v[2],m[1]*v[0]+m[5]*v[1]+m[9]*v[2],m[2]*v[0]+m[6]*v[1]+m[10]*v[2]];}
export function forwardKinematics(model,q=model.home) {
  const world=[],joints={};
  for(let i=0;i<model.bodies.length;i++){
    const body=model.bodies[i];let m=i===0?identity():multiply(world[body.parent],transform(body.pos,body.quat));
    for(const joint of body.joints){
      const value=q[joint.name]??0, axis=normalize(joint.axis);
      joints[joint.name]={position:point(m,joint.pos),axis:vector(m,axis),range:joint.range};
      // Source model has hinge joints; slide support keeps this routine explicit.
      if(joint.type===2)m=multiply(m,transform(axis.map(x=>x*value)));
      else if(joint.type===3){
        const s=Math.sin(value/2),r=transform([0,0,0],[Math.cos(value/2),...axis.map(x=>x*s)]);
        m=multiply(m,multiply(transform(joint.pos),multiply(r,transform(joint.pos.map(x=>-x)))));
      } else throw new Error('Unsupported robot joint type: '+joint.type);
    }
    world.push(m);
  }
  return {world,joints,camera:multiply(world[model.camera.body],transform(model.camera.pos,model.camera.quat))};
}
function solve3(a,b){
  const m=a.map((row,i)=>[...row,b[i]]);
  for(let col=0;col<3;col++){
    let pivot=col;for(let i=col+1;i<3;i++)if(Math.abs(m[i][col])>Math.abs(m[pivot][col]))pivot=i;
    [m[col],m[pivot]]=[m[pivot],m[col]];const d=m[col][col];if(Math.abs(d)<1e-14)return [0,0,0];
    for(let j=col;j<4;j++)m[col][j]/=d;
    for(let i=0;i<3;i++)if(i!==col){const f=m[i][col];for(let j=col;j<4;j++)m[i][j]-=f*m[col][j];}
  }return m.map(row=>row[3]);
}
/** Position-only damped least-squares IK, bounded by the source joint limits.
 * It drives the visual wrist; simulation physics and observer data are untouched.
 */
export function solveRightArm(model,target,seed=model.home,{iterations=18,tolerance=0.00015}={}) {
  const q={...model.home,...seed};let fk;
  for(let step=0;step<iterations;step++){
    fk=forwardKinematics(model,q);const p=point(fk.camera),err=sub(target,p);
    if(length(err)<tolerance)break;
    const columns=model.rightJoints.map(name=>cross(fk.joints[name].axis,sub(p,fk.joints[name].position)));
    const a=Array.from({length:3},(_,r)=>Array.from({length:3},(_,c)=>columns.reduce((s,j)=>s+j[r]*j[c],r===c?0.000225:0)));
    const gain=solve3(a,err);
    model.rightJoints.forEach((name,i)=>{const [lo,hi]=fk.joints[name].range;const dq=Math.max(-0.12,Math.min(0.12,dot(columns[i],gain)));q[name]=Math.max(lo,Math.min(hi,q[name]+dq));});
  }
  fk=forwardKinematics(model,q);return {q,fk,error:length(sub(target,point(fk.camera)))};
}
export function sceneFrame(model){
  const m=forwardKinematics(model).camera;
  return {origin:point(m),right:normalize(vector(m,[1,0,0])),up:normalize(vector(m,[0,1,0])),forward:normalize(vector(m,[0,0,-1]))};
}
export function planarPosition(frame,offset=[0,0],depth=0){
  return frame.origin.map((v,i)=>v+frame.right[i]*(offset[0]||0)-frame.up[i]*(offset[1]||0)+frame.forward[i]*depth);
}
