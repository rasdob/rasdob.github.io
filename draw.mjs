import {t} from './i18n.mjs?v=20261027design1';
import {drawReconstruction} from './reconstruction.mjs?v=20261027design1';
import {drawEstimationLesson} from './estimation-lessons.mjs?v=20261027design1';
import {project} from './engine.mjs?v=20261027design1';
const palette={green:'#147d6c',orange:'#b56e18',blue:'#0071e3',ink:'#31343a',grid:'#dedee3',dim:'#6e6e73',light:'#ffffff',dark:'#f5f5f7',mint:'#147d6c',gold:'#b56e18',ice:'#0071e3'};
const font='"Noto Sans CJK SC","Microsoft YaHei",system-ui,sans-serif';
function surface(canvas,w,h){
  const r=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);
  if(r.width<1||r.height<1)return null;
  const width=Math.round(r.width*dpr),height=Math.round(r.height*dpr);
  if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
  const c=canvas.getContext('2d');c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,width,height);
  const scale=Math.min(width/w,height/h);c.translate((width-w*scale)/2,(height-h*scale)/2);c.scale(scale,scale);
  c.lineCap='round';c.lineJoin='round';c.font=`13px ${font}`;c.fillStyle=palette.ink;return c;
}
function line(c,a,b,color=palette.ink,width=1,dash=[]){c.beginPath();c.setLineDash(dash);c.strokeStyle=color;c.lineWidth=width;c.moveTo(...a);c.lineTo(...b);c.stroke();c.setLineDash([]);}
function path(c,points,color,width=1,dash=[]){if(!points.length)return;c.beginPath();c.strokeStyle=color;c.lineWidth=width;c.setLineDash(dash);points.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.stroke();c.setLineDash([]);}
function circle(c,p,r,fill,stroke=null,lw=1){c.beginPath();c.arc(...p,r,0,Math.PI*2);if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=lw;c.stroke();}}
function text(c,value,x,y,color=palette.ink,size=13,align='left'){c.font=`${size}px ${font}`;c.textAlign=align;c.fillStyle=color;c.fillText(t(value),x,y);}
function box(c,x,y,w,h,fill,stroke=null,r=6){c.beginPath();c.roundRect(x,y,w,h,r);if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=1;c.stroke();}}
function arrow(c,a,b,color,width=2){line(c,a,b,color,width);const t=Math.atan2(b[1]-a[1],b[0]-a[0]);c.beginPath();c.moveTo(...b);c.lineTo(b[0]-9*Math.cos(t-.45),b[1]-9*Math.sin(t-.45));c.lineTo(b[0]-9*Math.cos(t+.45),b[1]-9*Math.sin(t+.45));c.closePath();c.fillStyle=color;c.fill();}
function marker(c,x,y,size,angle=0,alpha=1){c.save();c.translate(x,y);c.rotate(angle);c.globalAlpha=alpha;box(c,-size/2,-size/2,size,size,'#ffffff',null,1);c.fillStyle='#26272b';c.fillRect(-size*.41,-size*.41,size*.82,size*.82);const cells=[[1,0],[3,0],[0,1],[2,1],[3,1],[1,2],[2,2],[1,3],[3,3]];c.fillStyle='#ffffff';cells.forEach(([a,b])=>c.fillRect(-size*.29+a*size*.145,-size*.29+b*size*.145,size*.145,size*.145));c.restore();}
function cameraIcon(c,x,y,alpha=1){
 c.save();c.globalAlpha=alpha;
 box(c,x-11,y-22,22,13,'#69a9e8',palette.blue,3);
 box(c,x-22,y-12,44,28,'#e5f0fc',palette.blue,6);
 box(c,x-14,y-5,18,12,'#b4d4f5',null,2);circle(c,[x+12,y+1],3,palette.blue);
 c.restore();
}
function label(c,value,x,y,color=palette.green){c.font=`11px ${font}`;const w=c.measureText(t(value)).width+18;box(c,x,y-17,w,25,'#ffffff', '#dedee3',3);text(c,value,x+9,y,color,11);}
function cross(c,x,y,color,size=6){line(c,[x-size,y],[x+size,y],color,1.3);line(c,[x,y-size],[x,y+size],color,1.3);}
function grid(c,x,y,w,h,step=30,color=palette.grid){for(let a=x;a<=x+w;a+=step)line(c,[a,y],[a,y+h],color,.7);for(let b=y;b<=y+h;b+=step)line(c,[x,b],[x+w,b],color,.7);}
function movingDot(c,a,b,time,color=palette.green){const u=(time%1+1)%1;circle(c,[a[0]+(b[0]-a[0])*u,a[1]+(b[1]-a[1])*u],3,color);}

export function drawLesson(canvas,step,time,view){
 const c=surface(canvas,760,530);if(!c)return;
 if(step===0){
  const phase=time*.8+.6,displacement=42*Math.sin(phase),direction=Math.cos(phase)>=0?1:-1;
  for(let scenario=0;scenario<2;scenario++){
   const left=28+scenario*366,center=left+169;
   const targetX=center+(scenario===0?displacement:0),cameraX=center-(scenario===1?displacement:0);
   box(c,left,20,338,438,'#ffffff','#dce3eb',12);
   text(c,scenario===0?'Target motion':'Camera motion',center,49,scenario===0?palette.green:palette.blue,19,'center');
   text(c,scenario===0?'Camera stays still':'Target stays still',center,74,palette.dim,13,'center');
   grid(c,left+20,99,298,170,34,'#edf0f4');
   line(c,[center,99],[center,269],'#cbd5df',1,[3,5]);
   // Equal and opposite translations produce the same relative target position.
   for(const side of [-1,1])line(c,[cameraX,203],[targetX+side*21,156],'#c6d6e4',1.2);
   if(scenario===0)marker(c,center,135,42,0,.13);
   else cameraIcon(c,center,225,.15);
   marker(c,targetX,135,42);cameraIcon(c,cameraX,225);
   text(c,'Target',left+307,140,palette.green,12,'right');text(c,'Camera',left+307,230,palette.blue,12,'right');
   const movingX=scenario===0?targetX:cameraX,movingY=scenario===0?100:263,motionDirection=scenario===0?direction:-direction;
   arrow(c,[movingX-motionDirection*19,movingY],[movingX+motionDirection*19,movingY],scenario===0?palette.green:palette.blue,2.5);
   text(c,'Camera image',center,301,palette.dim,13,'center');
   box(c,left+26,315,286,122,'#f8fafc','#dce3eb',6);grid(c,left+34,323,270,106,27,'#e9eef4');
   const pixelX=center+(targetX-cameraX)*1.1,pixelY=376;
   for(const [dx,dy] of [[-25,-25],[25,-25],[25,25],[-25,25]])cross(c,center+dx,pixelY+dy,'#8d99a5',5);
   marker(c,pixelX,pixelY,50);
   for(const [dx,dy] of [[-25,-25],[25,-25],[25,25],[-25,25]])circle(c,[pixelX+dx,pixelY+dy],2.7,palette.green);
   arrow(c,[center-direction*19,423],[center+direction*19,423],palette.orange,2);
  }
  text(c,'Different 3D motions can produce the same pixel changes.',380,489,palette.ink,16,'center');
  text(c,'Use measured camera motion to isolate target motion.',380,514,palette.dim,12,'center');
 } else if(step===1){
  drawReconstruction(c,time,view);
 } else if(step===2||step===3){
  drawEstimationLesson(c,step,time);
 }
}

export function drawImage(canvas,sim){
 const c=surface(canvas,640,360);if(!c)return;grid(c,0,0,640,360,40,'#ececf0');
 c.strokeStyle='#bcc4cd';c.lineWidth=1;c.setLineDash([5,7]);c.strokeRect(12,12,616,336);c.setLineDash([]);
 cross(c,320,180,'#c6cbd1',12);const desired=project([0,0]);desired.forEach(p=>cross(c,...p,'#8d99a5',7));
 const r=sim.latest,center=r.clean.reduce((s,p)=>[s[0]+p[0]/4,s[1]+p[1]/4],[0,0]);
 const markerSide=Math.hypot(r.clean[1][0]-r.clean[0][0],r.clean[1][1]-r.clean[0][1]);
 marker(c,...center,markerSide,0,.7);path(c,[...r.pixels,r.pixels[0]],'#147d6c',1.3);r.pixels.forEach(p=>circle(c,p,4,'#147d6c'));
 desired.forEach((p,i)=>line(c,p,r.pixels[i],'#a7b8c5',.7,[2,4]));
 if(sim.config.mode==='tracking'&&r.plan.length){path(c,[center,...r.plan],palette.gold,1.6,[4,5]);r.plan.filter((_,i)=>i%2===0).forEach(p=>circle(c,p,2.5,palette.gold));}
 if(sim.config.mode==='estimate'){const end=[center[0]+r.estimated[0]*.35,center[1]+r.estimated[1]*.35];if(Math.hypot(...r.estimated)>1)arrow(c,center,end,palette.mint,2);}
 text(c,'u →',593,337,'#6e6e73',11);text(c,'v ↓',24,337,'#6e6e73',11);
 if(!r.visible){box(c,145,143,350,65,'#fff0e9','#c99a7c',4);text(c,'Target out of view: observations paused',320,181,'#9d4820',17,'center');}
}

export function drawChart(canvas,sim,kind='x'){
 const c=surface(canvas,1000,230);if(!c)return;const left=60,right=975,top=30,bottom=192,w=right-left,h=bottom-top;
 const records=sim.records;let series,labels;
 if(kind==='tracking'){series=[records.map(r=>[r.t,r.tracking])];labels=[palette.mint];}
 else if(kind==='error'){series=[records.map(r=>[r.t,r.estimateError]),records.map(r=>[r.t,r.dobError])];labels=[palette.mint,palette.gold];}
 else {const d=kind==='x'?0:1;series=[records.map(r=>[r.t,r.truth[d]]),records.map(r=>[r.t,r.estimated[d]]),records.map(r=>[r.t,r.dob[d]])];labels=['#697785',palette.mint,palette.gold];}
 const values=series.flat().map(p=>p[1]).filter(Number.isFinite);let min=kind==='error'||kind==='tracking'?0:Math.min(-10,...values),max=Math.max(10,...values);
 const padding=(max-min)*.13;max+=padding;if(min<0)min-=padding;
 const point=([t,v])=>[left+t/24*w,bottom-(v-min)/(max-min)*h];
 for(let i=0;i<=4;i++){const v=min+(max-min)*i/4,y=point([0,v])[1];line(c,[left,y],[right,y],'#e0e4e9',.7);text(c,v.toFixed(Math.abs(v)>99?0:1),left-12,y+4,'#6e6e73',10,'right');}
 for(let t=0;t<=24;t+=4){const x=point([t,0])[0];line(c,[x,top],[x,bottom],'#e8ebef',.7);text(c,String(t),x,bottom+20,'#6e6e73',10,'center');}
 series.forEach((s,i)=>path(c,s.map(point),labels[i],i===0&&series.length===3?1.6:2,i===0&&series.length===3?[5,5]:[]));
 text(c,kind==='tracking'?'px':'px/s',left,16,'#6e6e73',10);text(c,'Time (s)',(left+right)/2,bottom+35,'#6e6e73',10,'center');
 const x=point([sim.t,0])[0];line(c,[x,top],[x,bottom],'#939da9',.8);
}
