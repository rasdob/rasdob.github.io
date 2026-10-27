import {t} from './i18n.mjs?v=20261027corners1';
// A three-dimensional pinhole scene, drawn with Canvas so the lesson also works
// when WebGL is unavailable. Units and trajectories are illustrative.
export const RECONSTRUCTION_DURATION=24;
export const RECONSTRUCTION_STAGES=[
 {time:5.5,caption:'Physical consistency · One motion for all corners',title:'Can one rigid object explain these pixels?',subtitle:'Illustration: corners spread horizontally but keep their height',text:'Suppose the estimated corner motions spread the marker horizontally without changing its height. These pixel velocities cannot all come from one rigid motion at the shown geometry. Back-projecting them at the current depth would stretch the marker.',equation:'Pixel disturbance ≠ a consistent rigid motion',note:'Illustration with a front-facing marker and known geometry and depth. Orange shows fixed-depth back-projection, not measured observer output.',takeaway:'Sample object motion in 3D, then project all corners so their pixel disturbances share one physical explanation.'},
 {time:11.8,caption:'Real to sim · Reconstruct from observations',title:'Give image history a spatial basis',subtitle:'Pixels define rays; depth and camera pose locate points in 3D',text:'Combine images, estimated depth and measured camera motion to reconstruct target features in an auxiliary environment. The target geometry ties the features together for consistent motion prediction.',equation:'Images + depth + camera poses → 3D history',note:'This view illustrates projection geometry. Each historical image uses its corresponding camera pose.',takeaway:'The auxiliary environment links pixel changes to object motion.'},
 {time:18,caption:'Sampling · Explore possible target motion',title:'Explore possible motion in 3D',subtitle:'Preserve target shape and respect motion bounds',text:'Sample possible motions from the reconstructed history in the auxiliary environment. The target can move straight, turn or accelerate while preserving its shape and respecting speed and acceleration bounds. Images determine which motions fit.',equation:'Reconstruct → sample motions → compare with images',note:'Colored paths illustrate possible motions. The actual target trajectory is not known in advance.',takeaway:'Use spatially consistent motions, then let observations select them.'},
 {time:24,caption:'Sim to real · Return an image disturbance forecast',title:'From object motion to image disturbance',subtitle:'One object motion → four projected corners',text:'Project all four corners of the moving target back into the image. Each corner has its own pixel displacement, while all four share the same object motion. Holding the current camera pose fixed isolates the target-induced disturbance.',equation:'3D motion → four corner displacements → image disturbance',note:'Matching numbers link each 3D corner to its image projection. Arrows show the pixel displacement of each corner.',takeaway:'One spatial motion explains the image disturbance at all four corners.'}
];
export const IMAGE_DEPTH=1.15;
export const TARGET_DEPTH=3.2;
export const TARGET_CENTER=[.12,.18,TARGET_DEPTH];
const MARKER_SIZE=.50;
const IMAGE_HALF_WIDTH=1.06,IMAGE_HALF_HEIGHT=.66;
const half=MARKER_SIZE/2;
export const TARGET_CORNERS=[[-half,half],[half,half],[half,-half],[-half,-half]].map(([x,y])=>[x+TARGET_CENTER[0],y+TARGET_CENTER[1],TARGET_DEPTH]);
export const imagePoint=p=>[p[0]*IMAGE_DEPTH/p[2],p[1]*IMAGE_DEPTH/p[2],IMAGE_DEPTH];
export const reconstructPoint=(p,depth)=>[p[0]*depth/IMAGE_DEPTH,p[1]*depth/IMAGE_DEPTH,depth];
const clamp=x=>Math.min(1,Math.max(0,x));
const smooth=(a,b,t)=>{const u=clamp((t-a)/(b-a));return u*u*(3-2*u);};
const mix=(a,b,t)=>a+(b-a)*t;
const lerp=(a,b,t)=>a.map((v,i)=>mix(v,b[i],t));
export function reconstructionState(seconds){
 const t=clamp(seconds/RECONSTRUCTION_DURATION);
 return {progress:t,turn:smooth(1.1,4.2,seconds),inconsistency:smooth(1.7,4,seconds)*(1-smooth(6,7.5,seconds)),rays:smooth(6,8.5,seconds),lift:smooth(8,11.5,seconds),sampling:smooth(12,17.5,seconds),returning:smooth(18,22.5,seconds),stage:seconds<6?0:seconds<12?1:seconds<18.5?2:3};
}

// Deliberately constructed teaching example, not an observer measurement.
// Horizontal expansion alone violates rigid-motion compatibility for this
// frontoparallel square at its known current geometry.
export function examplePixelDisturbance(){
 return TARGET_CORNERS.map(p=>[.8*IMAGE_DEPTH*(p[0]-TARGET_CENTER[0])/TARGET_DEPTH,0]);
}
export function examplePixels(amount){
 const disturbance=examplePixelDisturbance();
 return TARGET_CORNERS.map((p,i)=>imagePoint(p).map((v,axis)=>v+(axis<2?amount*disturbance[i][axis]:0)));
}
export function sceneProject(p,{yaw=0,pitch=0,focus=[0,0,IMAGE_DEPTH],scale=220,distance=7,center=[380,260]}={}){
 const [dx,dy,dz]=p.map((v,i)=>v-focus[i]);
 const x=Math.cos(yaw)*dx+Math.sin(yaw)*dz,z=-Math.sin(yaw)*dx+Math.cos(yaw)*dz;
 const y=Math.cos(pitch)*dy-Math.sin(pitch)*z,depth=Math.sin(pitch)*dy+Math.cos(pitch)*z;
 const s=scale*distance/(distance+depth);
 return [center[0]+x*s,center[1]-y*s];
}
const colors=['#0071e3','#b56e18','#147d6c','#8262b3'];
const font='"Noto Sans CJK SC","Microsoft YaHei",system-ui,sans-serif';
function poly(c,points,fill,stroke,width=1){c.beginPath();points.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.closePath();if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.stroke();}}
function stroke(c,points,color,width=1,dash=[]){c.beginPath();c.setLineDash(dash);points.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.strokeStyle=color;c.lineWidth=width;c.stroke();c.setLineDash([]);}
function arrow(c,a,b,color,width=2){
 stroke(c,[a,b],color,width);const angle=Math.atan2(b[1]-a[1],b[0]-a[0]),head=Math.min(6,Math.hypot(b[0]-a[0],b[1]-a[1])*.55);
 poly(c,[b,[b[0]-head*Math.cos(angle-.5),b[1]-head*Math.sin(angle-.5)],[b[0]-head*Math.cos(angle+.5),b[1]-head*Math.sin(angle+.5)]],color);
}
function dot(c,p,color,r=4){c.beginPath();c.arc(...p,r,0,Math.PI*2);c.fillStyle=color;c.fill();}
function text(c,s,x,y,size=12,color='#6e6e73',align='left'){c.font=`${size}px ${font}`;c.textAlign=align;c.fillStyle=color;c.fillText(t(s),x,y);}
function tag(c,label,p,color='#0071e3'){
 c.font=`12px ${font}`;const w=c.measureText(t(label)).width+20;
 c.beginPath();c.roundRect(p[0]-w/2,p[1]-17,w,27,7);c.fillStyle='#ffffffed';c.fill();c.strokeStyle='#e1e5eb';c.lineWidth=.8;c.stroke();text(c,label,p[0],p[1]+1,12,color,'center');
}
function card(c,x,y,w,h){
 c.save();c.shadowColor='#29435c10';c.shadowBlur=16;c.shadowOffsetY=4;
 c.beginPath();c.roundRect(x,y,w,h,12);c.fillStyle='#fffffff5';c.fill();c.shadowBlur=0;c.shadowOffsetY=0;c.strokeStyle='#dce5ee';c.lineWidth=.8;c.stroke();c.restore();
}
function plane(c,project,center,extent,fill,edge){
 const [x,y,z]=center,[w,h]=extent;
 const corners=[[x-w,y+h,z],[x+w,y+h,z],[x+w,y-h,z],[x-w,y-h,z]];
 poly(c,corners.map(project),fill,edge,1.2);return corners;
}
function markerCorners(c,project,corners,opacity=1){
 c.save();c.globalAlpha*=opacity;
 poly(c,corners.map(project),'#26333f','#d7e0e7');
 // Interpolate in the marker's actual 3D plane before perspective projection.
 const at=(u,v)=>lerp(lerp(corners[0],corners[1],u),lerp(corners[3],corners[2],u),v);
 for(const [x,y] of [[1,1],[2,1],[2,2],[1,3],[2,3],[3,3],[4,3],[3,4]]){
  poly(c,[[x,y],[x+1,y],[x+1,y+1],[x,y+1]].map(([u,v])=>project(at(u/6,v/6))),'#fff');
 }
 c.restore();
}
function marker(c,project,center,size,opacity=1){
 markerCorners(c,project,[[-1,1],[1,1],[1,-1],[-1,-1]].map(([x,y])=>[center[0]+x*size/2,center[1]+y*size/2,center[2]]),opacity);
}
function cornerLabels(c,points,color,size=10,bounds=[80,436]){
 const offsets=[[-7,-7],[7,-7],[7,13],[-7,13]];
 points.forEach((p,i)=>{
  dot(c,p,'#fff',4.5);dot(c,p,color,2.8);
  const baseline=Math.max(bounds[0]+size+2,Math.min(bounds[1]-2,p[1]+offsets[i][1]));
  text(c,String(i+1),p[0]+offsets[i][0],baseline,size,color,i===0||i===3?'right':'left');
 });
}
export function candidatePath(family,t,variant=0){
 const [x,y,z]=TARGET_CENTER;
 if(family===0)return [x+(.8+variant*.13)*t,y+(.65+variant*.08)*t,z+(.48+variant*.06)*t];
 if(family===1)return [x+.62*t,y-.65*t*t+variant*.08*t,z+1.0*t];
 if(family===2){const a=t*2.4,r=.55+variant*.035;return [x+r*2/Math.sqrt(5)*Math.sin(a),y+r*(1-Math.cos(a)),z+r/Math.sqrt(5)*Math.sin(a)];}
 return [x-.42*t+.12*Math.sin(t*6)*t+variant*.10*t,y-.45*t+.16*Math.sin(t*7)*t,z+.95*t];
}
/** Stable corner order: top-left, top-right, bottom-right, bottom-left.
 * Translate the rigid marker first, then project each corner independently.
 */
export function candidateCorners(family,time,variant=0){
 const center=candidatePath(family,time,variant);
 return TARGET_CORNERS.map(corner=>corner.map((value,axis)=>value+center[axis]-TARGET_CENTER[axis]));
}
function pixelInset(c,state,seconds){
 const {stage,sampling,returning}=state,x=22,y=232,w=236,h=204;
 card(c,x,y,w,h);
 text(c,stage===0?'Pixel disturbance':'Image projection',x+15,y+23,12,'#344b60');
 const origin=imagePoint(TARGET_CENTER),map=p=>[x+72+(p[0]-origin[0])*210,y+144-(p[1]-origin[1])*210];
 c.save();c.beginPath();c.rect(x+10,y+33,w-20,h-58);c.clip();
 for(let a=x+18;a<x+w;a+=23)stroke(c,[[a,y+33],[a,y+h-25]],'#eaf0f5',.7);
 for(let b=y+35;b<y+h-25;b+=21)stroke(c,[[x+10,b],[x+w-10,b]],'#eaf0f5',.7);
 if(stage===0){
  const focus=imagePoint(TARGET_CENTER),zoom=p=>[x+w/2+(p[0]-focus[0])*300,y+77-(p[1]-focus[1])*300];
  const current=TARGET_CORNERS.map(imagePoint),predicted=examplePixels(smooth(0,5.5,seconds));
  marker(c,zoom,focus,MARKER_SIZE*IMAGE_DEPTH/TARGET_DEPTH,.8);
  poly(c,current.map(zoom),null,'#147d6c',1.2);
  poly(c,predicted.map(zoom),'#b56e1809','#b56e18',1.5);
  current.forEach((p,i)=>{
   arrow(c,zoom(p),zoom(examplePixels(1)[i]),'#b56e18',2.2);
   dot(c,zoom(p),'#147d6c',2.5);
  });
 }else{
  c.globalAlpha=1-returning*.6;
  // A front-facing view of the same projected marker, larger than its oblique view.
  const toInset=p=>map(p);marker(c,toInset,origin,MARKER_SIZE*IMAGE_DEPTH/TARGET_DEPTH,.85);
  for(const p of TARGET_CORNERS.map(imagePoint))dot(c,map(p),'#0071e3',3);
  c.globalAlpha=1;
  if(sampling>0)for(let family=0;family<4;family++){
   c.globalAlpha=family===2?.55:Math.max(.06,(1-returning)*.4);
   for(let corner=0;corner<4;corner++){
    const points=Array.from({length:49},(_,i)=>map(imagePoint(candidateCorners(family,i/48*sampling)[corner])));
    stroke(c,points,colors[family],family===2?1.4:.7);
   }
  }
  if(returning>0){
   c.globalAlpha=1;
   const time=clamp((seconds-18)/6),pixels=candidateCorners(2,time).map(imagePoint),next=candidateCorners(2,time+.14).map(imagePoint);
   markerCorners(c,map,pixels,.8);
   poly(c,pixels.map(map),null,colors[2],1.8);
   pixels.forEach((p,i)=>arrow(c,map(p),map(next[i]),colors[2],1.8));
   cornerLabels(c,pixels.map(map),colors[2],10,[y+33,y+h-25]);
  }
 }
 c.restore();text(c,stage===0?'Wider, with unchanged height':stage===3?'Four corners · four pixel motions':stage===1?'Projected target corners':'3D paths predict pixel motion',x+15,y+h-10,10,'#7d8c99');
}
export function drawReconstruction(c,seconds,view={yaw:0,pitch:0}){
 const state=reconstructionState(seconds),{turn,inconsistency,rays,lift,sampling,returning,stage}=state;
 const cameraView={yaw:turn*1.04+(view.yaw||0),pitch:turn*.30+(view.pitch||0),focus:[0,mix(0,-.02,turn),mix(IMAGE_DEPTH,1.9,turn)],scale:mix(230,135,turn),center:[mix(380,400,turn),250]};
 const project=p=>sceneProject(p,cameraView);
 const wash=c.createRadialGradient(430,240,10,430,240,350);wash.addColorStop(0,'#e5effb8c');wash.addColorStop(1,'#f5f5f700');c.fillStyle=wash;c.fillRect(0,75,760,360);
 text(c,RECONSTRUCTION_STAGES[stage].title,380,36,18,'#253342','center');
 text(c,RECONSTRUCTION_STAGES[stage].subtitle,380,60,12,'#6e6e73','center');
 c.save();c.beginPath();c.rect(24,80,712,356);c.clip();
 // Ground plane and world axes become visible as the view leaves the image.
 c.save();c.globalAlpha=turn;
 poly(c,[[-1.45,-.94,-.55],[1.55,-.94,-.55],[1.55,-.94,4.8],[-1.45,-.94,4.8]].map(project),'#eaf0f5a0','#dce5ed');
 for(let x=-1.4;x<=1.6;x+=.3)stroke(c,[[x,-.94,-.55],[x,-.94,4.8]].map(project),'#d8e2ec',.7);
 for(let z=-.5;z<=4.8;z+=.35)stroke(c,[[-1.45,-.94,z],[1.55,-.94,z]].map(project),'#d8e2ec',.7);
 c.restore();
 // Pinhole camera body. The optical center is the origin; +z faces the target.
 c.save();c.globalAlpha=turn;
 const back=[[-.21,.15,-.3],[.21,.15,-.3],[.21,-.15,-.3],[-.21,-.15,-.3]],front=back.map(([x,y])=>[x,y,-.05]);
 poly(c,[back[0],back[1],front[1],front[0]].map(project),'#667f94','#536a80');
 poly(c,[back[1],back[2],front[2],front[1]].map(project),'#354b60','#536a80');
 poly(c,front.map(project),'#465f75','#536a80');
 plane(c,project,[0,0,.005],[.09,.09],'#213b50','#82b8de');
 stroke(c,[[0,-.15,-.15],[0,-.94,-.15]].map(project),'#9baebd',3);
 stroke(c,[[-.25,-.94,-.15],[.25,-.94,-.15]].map(project),'#9baebd',3);
 // The frustum is clipped at the virtual image plane, never a target-motion path.
 const corners=[[-IMAGE_HALF_WIDTH,IMAGE_HALF_HEIGHT,IMAGE_DEPTH],[IMAGE_HALF_WIDTH,IMAGE_HALF_HEIGHT,IMAGE_DEPTH],[IMAGE_HALF_WIDTH,-IMAGE_HALF_HEIGHT,IMAGE_DEPTH],[-IMAGE_HALF_WIDTH,-IMAGE_HALF_HEIGHT,IMAGE_DEPTH]];
 corners.forEach(p=>stroke(c,[[0,0,0],p].map(project),'#a6c3dc',1,[3,5]));
 c.restore();
 // A genuine 3D image plane: the same four projected points used below.
 plane(c,project,[0,0,IMAGE_DEPTH],[IMAGE_HALF_WIDTH,IMAGE_HALF_HEIGHT],'#ffffffdb','#86afd0');
 for(let x=-1;x<IMAGE_HALF_WIDTH;x+=.2)stroke(c,[[x,-IMAGE_HALF_HEIGHT,IMAGE_DEPTH],[x,IMAGE_HALF_HEIGHT,IMAGE_DEPTH]].map(project),'#e3ebf2',.7);
 for(let y=-.6;y<IMAGE_HALF_HEIGHT;y+=.2)stroke(c,[[-IMAGE_HALF_WIDTH,y,IMAGE_DEPTH],[IMAGE_HALF_WIDTH,y,IMAGE_DEPTH]].map(project),'#e3ebf2',.7);
 marker(c,project,imagePoint(TARGET_CENTER),MARKER_SIZE*IMAGE_DEPTH/TARGET_DEPTH,.85);
 const pixels=TARGET_CORNERS.map(imagePoint);
 pixels.forEach((p,i)=>{
  c.save();c.globalAlpha=rays*.8;
  stroke(c,[[0,0,0],lerp(p,TARGET_CORNERS[i],rays)].map(project),'#d09c53',1.3);
  c.restore();dot(c,project(p),'#0071e3',2.5);
 });
 const predictedPixels=examplePixels(smooth(0,5.5,seconds));
 if(stage===0){
  poly(c,predictedPixels.map(project),null,'#b56e18',1.5);
  pixels.forEach((p,i)=>arrow(c,project(p),project(examplePixels(1)[i]),'#b56e18',1.5));
 }
 if(inconsistency>0){
  c.save();c.globalAlpha=inconsistency;
  marker(c,project,TARGET_CENTER,MARKER_SIZE,.65);
  poly(c,TARGET_CORNERS.map(project),null,'#147d6c',2);
  const stretched=predictedPixels.map(p=>reconstructPoint(p,TARGET_DEPTH));
  poly(c,stretched.map(project),'#b56e1812','#b56e18',2.3);
  stretched.forEach((p,i)=>{
   stroke(c,[project(predictedPixels[i]),project(p)],'#b56e1870',1,[3,5]);
   arrow(c,project(TARGET_CORNERS[i]),project(p),'#b56e18',2);dot(c,project(p),'#b56e18',3);
  });
  c.restore();
 }
 if(lift>0){
  const depth=mix(IMAGE_DEPTH,TARGET_DEPTH,lift),movingCenter=reconstructPoint(imagePoint(TARGET_CENTER),depth);
  c.save();c.globalAlpha=smooth(.01,.20,lift);
  marker(c,project,movingCenter,MARKER_SIZE*depth/TARGET_DEPTH);
  pixels.forEach(p=>dot(c,project(reconstructPoint(p,depth)),'#147d6c',3));
  stroke(c,[[movingCenter[0],movingCenter[1],depth],[movingCenter[0],-.94,depth]].map(project),'#9ab0bd',1,[3,4]);
  c.restore();
 }
 // Fixed camera, object-space hypotheses. Each family has a small fan of paths.
 if(sampling>0){
  for(let family=0;family<4;family++){
   const emphasis=family===2?1:1-returning*.85;
   for(const variant of [-1,1]){c.save();c.globalAlpha=.16*sampling*emphasis;stroke(c,Array.from({length:49},(_,i)=>project(candidatePath(family,i/48*sampling,variant))),colors[family],1);c.restore();}
   const points=Array.from({length:49},(_,i)=>project(candidatePath(family,i/48*sampling)));
   c.save();c.globalAlpha=sampling*emphasis;
   if(family===2&&returning>0){c.globalAlpha*=.12;stroke(c,points,colors[family],10);c.globalAlpha=sampling;}
   stroke(c,points,colors[family],2.3);
   for(const t of [.35,.67])if(sampling>t)marker(c,project,candidatePath(family,t),MARKER_SIZE,.12);
   const end=candidatePath(family,sampling);marker(c,project,end,MARKER_SIZE,.95*(1-returning*.8));c.restore();
   c.save();c.globalAlpha=sampling*emphasis*.8;
   for(let corner=0;corner<4;corner++)stroke(c,Array.from({length:49},(_,i)=>project(imagePoint(candidateCorners(family,i/48*sampling)[corner]))),colors[family],family===2?1.2:.65);
   c.restore();
  }
 }
 if(returning>0){
  c.save();c.globalAlpha=returning;
  const time=clamp((seconds-18)/6),corners=candidateCorners(2,time),pixels=corners.map(imagePoint),next=candidateCorners(2,time+.14).map(imagePoint);
  markerCorners(c,project,corners,.95);markerCorners(c,project,pixels,.85);
  poly(c,corners.map(project),null,'#147d6c',1.8);poly(c,pixels.map(project),null,'#147d6c',1.8);
  corners.forEach((corner,i)=>{
   stroke(c,[project(corner),project(pixels[i])],'#147d6c85',1.2,[4,4]);
   arrow(c,project(pixels[i]),project(next[i]),'#147d6c',2);
  });
  cornerLabels(c,corners.map(project),'#147d6c');cornerLabels(c,pixels.map(project),'#147d6c');
  c.restore();
 }
 // The coordinate triad makes depth and the orbit direction explicit.
 c.save();c.globalAlpha=turn;
 const origin=[-1.15,-.94,.0];
 for(const [axis,offset,color] of [['x',[.45,0,0],'#7c96ab'],['y',[0,.45,0],'#7c96ab'],['z',[0,0,.45],'#0071e3']]){
  const end=origin.map((v,i)=>v+offset[i]);stroke(c,[origin,end].map(project),color,1.7);const p=project(end);text(c,axis,p[0]+5,p[1],11,color);
 }
 c.restore();c.restore();
 const imageLabel=project([0,-IMAGE_HALF_HEIGHT-.16,IMAGE_DEPTH]);
 if(turn>.4)imageLabel[0]=Math.max(imageLabel[0],336);
 tag(c,'2D image plane',imageLabel);
 if(turn>.4){const p=project([0,.4,-.05]);tag(c,'Camera',p,'#536a80');}
 if(lift>.95){const p=project([TARGET_CENTER[0]-.28,TARGET_CENTER[1]-half-.18,TARGET_DEPTH]);tag(c,'Reconstructed target',p,'#147d6c');}
 if(rays>.5&&sampling<.2){const p=project([-.25,-.50,2.15]);tag(c,'Depth → 3D position',p,'#a77426');}
 if(inconsistency>.3){
  c.save();c.globalAlpha=inconsistency;
  const center=project(TARGET_CENTER);tag(c,'Original rigid marker',[center[0]+15,center[1]-60],'#147d6c');
  tag(c,'Fixed-depth back-projection stretches the marker',[center[0]+10,center[1]+69],'#b56e18');
  c.restore();
 }
 if(turn>.4){c.save();c.globalAlpha=smooth(.4,.9,turn);pixelInset(c,state,seconds);c.restore();}
 const facts=[
  [['Image plane','Corners can be estimated independently','#b56e18'],['One rigid motion','A rigid marker cannot simply stretch','#147d6c']],
  [['Reconstruction inputs','Images · depth · measured camera motion','#0071e3'],['Spatial constraints','Target features and rigid geometry','#147d6c']],
  [['Motion bounds','Fixed shape; bounded speed and acceleration','#147d6c'],['Possible motions','Straight, accelerating, turning or irregular','#0071e3']],
  [['3D → image','One motion projects all four corners','#147d6c'],['Next','Compare corresponding corners','#0071e3']]
 ][stage];
 facts.forEach(([heading,value,color],i)=>{const x=28+i*362;card(c,x,450,342,62);text(c,heading,x+15,470,10,'#7d8c99');text(c,value,x+15,495,13,color);});
}
