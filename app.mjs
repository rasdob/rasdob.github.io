import {t,onLanguageChange,initializeLanguage} from './i18n.mjs?v=20261027corners1';
import {RECONSTRUCTION_DURATION,RECONSTRUCTION_STAGES,reconstructionState} from './reconstruction.mjs?v=20261027corners1';
import {Simulation,DEFAULTS,H} from './engine.mjs?v=20261027corners1';
import {drawLesson,drawImage,drawChart} from './draw.mjs?v=20261027corners1';
import {ESTIMATION_DURATION,ESTIMATION_LESSONS,estimationState} from './estimation-lessons.mjs?v=20261027corners1';
const $=id=>document.getElementById(id), $$=s=>[...document.querySelectorAll(s)];
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
let labRobot=null;
const exploreButton=$('explore-toggle'),exploreMenu=$('explore-menu');
function closeExplore(){exploreButton.setAttribute('aria-expanded','false');exploreMenu.hidden=true;}
exploreButton.onclick=()=>{const expanded=exploreButton.getAttribute('aria-expanded')==='true';exploreButton.setAttribute('aria-expanded',String(!expanded));exploreMenu.hidden=expanded;};
exploreMenu.addEventListener('click',e=>{if(e.target.closest('a'))closeExplore();});
document.addEventListener('click',e=>{if(!e.target.closest('.explore'))closeExplore();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!exploreMenu.hidden){closeExplore();exploreButton.focus();}});
$('lab-view-reset').onclick=()=>labRobot?.resetView();

const lessons=[
 {label:'TARGET MOTION / CAMERA MOTION',kicker:'01 / THE PROBLEM',title:'Pixels move.<br>What caused the motion?',text:'On the left, only the target moves. On the right, only the camera moves. These different motions can produce the same pixel displacement. Measured camera motion helps separate the target contribution from the observed image change.',equation:'Pixel motion = camera contribution + target disturbance',equationLabel:'Pixel dynamics: ė = B q̇ + d',takeaway:'Pixels reflect relative motion. Camera feedback helps explain the image disturbance caused by the target.',legend:[['Target','#147d6c'],['Camera','#0071e3'],['Desired pixels','#8d99a5']]},
 {label:'REAL → SIM → REAL',kicker:'02 / RECONSTRUCT & SAMPLE',title:'Give pixel predictions<br>a physical explanation.',text:RECONSTRUCTION_STAGES[0].text,equation:RECONSTRUCTION_STAGES[0].equation,equationLabel:RECONSTRUCTION_STAGES[0].note,takeaway:RECONSTRUCTION_STAGES[0].takeaway,legend:[['Rigid marker','#147d6c'],['Illustrative pixel disturbance','#b56e18']]},
 {label:'PRIORS → OBSERVATIONS → FORECAST',kicker:'03 / SCORE & PREDICT',title:'Propose possible motions.<br>Let observations decide.',text:'SDOB samples image disturbances around its previous estimate. RA-SDOB samples spatial trajectories with motion priors, weights each group and selects the best image fit.',equation:'Motion priors → image scoring → disturbance forecast',equationLabel:'Priors suggest possible motion patterns; they do not reveal the actual target trajectory.',takeaway:'Priors propose possibilities. Observations determine which ones explain the motion.',legend:[['Motion priors','#0071e3'],['Observations','#697785'],['Disturbance forecast','#147d6c']]},
 {label:'COMMANDS → FEEDBACK → RESPONSE',kicker:'04 / IDENTIFY THE RESPONSE',title:'One command history.<br>Which response fits?',text:ESTIMATION_LESSONS[3].stages[0].text,equation:'Candidate responses → feedback comparison → response update',equationLabel:ESTIMATION_LESSONS[3].stages[0].note,takeaway:ESTIMATION_LESSONS[3].stages[0].takeaway,legend:[['Candidate prediction','#0071e3'],['Position feedback','#b56e18'],['Selected response','#147d6c']]}
];
let lessonIndex=0,lessonPlaying=false,lessonTimer=0,lessonTime=0;
let reconstructionPlaying=!reduced,reconstructionDrag=null,reconstructionStage=-1;
let estimationPlaying=!reduced,estimationStage=-1;
const reconstructionView={yaw:0,pitch:0};
function refreshLessonCopy(){
 const l=lessons[lessonIndex];
 $('lesson-kicker').textContent=t(l.kicker);$('lesson-title').innerHTML=t(l.title);$('lesson-text').textContent=t(l.text);$('lesson-equation').innerHTML=t(l.equation);$('lesson-equation-label').textContent=t(l.equationLabel);$('lesson-takeaway').textContent=t(l.takeaway);$('lesson-scene-label').textContent=t(l.label);$('lesson-count').textContent=`0${lessonIndex+1} / 0${lessons.length}`;
 $('lesson-legend').innerHTML=l.legend.map(([name,color])=>`<span style="--legend:${color}">${t(name)}</span>`).join('');
 $$('.lesson-tabs button').forEach((b,i)=>{b.setAttribute('aria-selected',i===lessonIndex?'true':'false');b.tabIndex=i===lessonIndex?0:-1;});
 $('lesson-panel').setAttribute('aria-labelledby',`tab-${lessonIndex}`);$('lesson-progress').style.width=`${(lessonIndex+1)/lessons.length*100}%`;
 $('reconstruction-controls').hidden=lessonIndex!==1;
 $('estimation-controls').hidden=lessonIndex<2;
 $('estimation-stage-buttons').hidden=false;
 $('estimation-hint').textContent=t('Select a stage or drag the timeline');
 $('lesson-canvas').classList.toggle('reconstruction-canvas',lessonIndex===1);$('lesson-canvas').tabIndex=lessonIndex===1?0:-1;
 $('lesson-canvas').setAttribute('aria-label',t(lessonIndex===0?'Side-by-side animation: target motion on the left and opposite camera motion on the right produce the same pixel displacement below.':lessonIndex===1?'Conceptual example: horizontal corner separation cannot arise from one rigid motion under the illustrated geometry. Back-projection at fixed depth widens the marker. Spatial reconstruction and sampling give pixel predictions a shared physical explanation. Use arrow keys to rotate.':'Animated explanation of the current step'));
 if(lessonIndex>=2){
  const stages=ESTIMATION_LESSONS[lessonIndex].stages;
  $$('[data-estimation-stage]').forEach((button,i)=>{button.querySelector('span').textContent=t(stages[i].title);});
  $('lesson-canvas').setAttribute('aria-label',t(lessonIndex===2?'Animated stages: add motion priors, compare with image history, update confidence and forecast target-induced pixel disturbances.':'Model demonstration: candidate response lags share one command history, with a fitted gain for each. Predicted joint displacements are compared with feedback to select the smallest-error response.'));
 }
}
function selectLesson(index){
 lessonIndex=(index+lessons.length)%lessons.length;lessonTimer=0;lessonTime=0;
 reconstructionPlaying=!reduced;reconstructionStage=-1;reconstructionView.yaw=0;reconstructionView.pitch=0;
 estimationPlaying=!reduced;estimationStage=-1;
 refreshLessonCopy();
 if(lessonIndex===1&&reduced&&!lessonPlaying)lessonTime=RECONSTRUCTION_DURATION;
 if(lessonIndex>=2&&reduced&&!lessonPlaying)lessonTime=ESTIMATION_DURATION;
 drawLessonScene();
}
$$('.lesson-tabs button').forEach(button=>{
 button.addEventListener('click',()=>selectLesson(Number(button.dataset.step)));
 button.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();selectLesson(e.key==='Home'?0:e.key==='End'?lessons.length-1:lessonIndex+(e.key==='ArrowRight'?1:-1));$(`tab-${lessonIndex}`).focus();}});
});
$('lesson-prev').onclick=()=>selectLesson(lessonIndex-1);$('lesson-next').onclick=()=>selectLesson(lessonIndex+1);
$('lesson-play').onclick=()=>{
 if(!lessonPlaying&&lessonIndex===lessons.length-1&&lessonTimer>=ESTIMATION_DURATION)selectLesson(0);
 lessonPlaying=!lessonPlaying;
 if(lessonIndex===1){
  reconstructionPlaying=lessonPlaying;
  if(lessonPlaying){if(lessonTime>=RECONSTRUCTION_DURATION)lessonTime=0;lessonTimer=lessonTime;}
  drawLessonScene();
 }
 if(lessonIndex>=2){
  estimationPlaying=lessonPlaying;
  if(lessonPlaying){if(lessonTime>=ESTIMATION_DURATION)lessonTime=0;lessonTimer=lessonTime;}
  drawLessonScene();
 }
 $('lesson-play').textContent=t(lessonPlaying?'Ⅱ Pause tour':'▶ Play tour');
};
function drawLessonScene(){
 drawLesson($('lesson-canvas'),lessonIndex,lessonTime,reconstructionView);
 if(lessonIndex>=2){
  const stage=estimationState(lessonIndex,lessonTime).stage,content=ESTIMATION_LESSONS[lessonIndex].stages[stage];
  $('estimation-progress').value=lessonTime;
  $('estimation-progress').setAttribute('aria-valuetext',t('{stage}, {time} seconds',{stage:t(content.title),time:lessonTime.toFixed(1)}));
  if(estimationStage!==stage){
   estimationStage=stage;
   $('estimation-caption').textContent=t(content.caption);
   $('lesson-text').textContent=t(content.text);
   $('lesson-equation-label').textContent=t(content.note);
   $('lesson-takeaway').textContent=t(content.takeaway);
   if(lessonIndex===3)$('lesson-legend').innerHTML=lessons[3].legend.slice(0,stage===2?3:2).map(([name,color])=>`<span style="--legend:${color}">${t(name)}</span>`).join('');
   $$('[data-estimation-stage]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.estimationStage)===stage)));
  }
  $('estimation-play').textContent=estimationPlaying?'Ⅱ':'▶';
  $('estimation-play').setAttribute('aria-label',t(estimationPlaying?'Pause estimation animation':'Play estimation animation'));
  return;
 }
 if(lessonIndex!==1)return;
 const stage=reconstructionState(lessonTime).stage,content=RECONSTRUCTION_STAGES[stage];
 $('reconstruction-progress').value=lessonTime;
 if(reconstructionStage!==stage){
  reconstructionStage=stage;
  $('reconstruction-caption').textContent=t(content.caption);
  $('lesson-text').textContent=t(content.text);$('lesson-equation').textContent=t(content.equation);$('lesson-equation-label').textContent=t(content.note);$('lesson-takeaway').textContent=t(content.takeaway);
  const legend=stage===0?[['Rigid marker','#147d6c'],['Illustrative pixel disturbance','#b56e18']]:stage===1?[['Pixel rays','#b56e18'],['Spatial features','#147d6c']]:[['Uniform','#0071e3'],['Accelerating','#b56e18'],['Circular','#147d6c'],['Random','#8262b3']];
  $('lesson-legend').innerHTML=legend.map(([name,color])=>`<span style="--legend:${color}">${t(name)}</span>`).join('');
 }
 $('reconstruction-progress').setAttribute('aria-valuetext',t('{stage}, {time} seconds',{stage:t(content.caption),time:lessonTime.toFixed(1)}));
 $$('[data-reconstruction-stage]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.reconstructionStage)===stage)));
 $('reconstruction-play').textContent=reconstructionPlaying?'Ⅱ':'▶';
 $('reconstruction-play').setAttribute('aria-label',t(reconstructionPlaying?'Pause reconstruction animation':'Play reconstruction animation'));
}
function stopLessonAuto(){lessonPlaying=false;$('lesson-play').textContent=t('▶ Play tour');}
$('reconstruction-play').onclick=()=>{stopLessonAuto();if(lessonTime>=RECONSTRUCTION_DURATION)lessonTime=0;reconstructionPlaying=!reconstructionPlaying;drawLessonScene();};
$('reconstruction-replay').onclick=()=>{stopLessonAuto();lessonTime=0;reconstructionPlaying=true;reconstructionView.yaw=0;reconstructionView.pitch=0;drawLessonScene();};
$('reconstruction-progress').oninput=()=>{stopLessonAuto();reconstructionPlaying=false;lessonTime=Number($('reconstruction-progress').value);drawLessonScene();};
$$('[data-reconstruction-stage]').forEach(b=>b.onclick=()=>{stopLessonAuto();reconstructionPlaying=false;lessonTime=RECONSTRUCTION_STAGES[Number(b.dataset.reconstructionStage)].time;drawLessonScene();});
$('estimation-play').onclick=()=>{stopLessonAuto();if(lessonTime>=ESTIMATION_DURATION)lessonTime=0;estimationPlaying=!estimationPlaying;drawLessonScene();};
$('estimation-replay').onclick=()=>{stopLessonAuto();lessonTime=0;estimationPlaying=true;drawLessonScene();};
$('estimation-progress').oninput=()=>{stopLessonAuto();estimationPlaying=false;lessonTime=Number($('estimation-progress').value);drawLessonScene();};
$$('[data-estimation-stage]').forEach(b=>b.onclick=()=>{stopLessonAuto();estimationPlaying=false;lessonTime=ESTIMATION_LESSONS[lessonIndex].stages[Number(b.dataset.estimationStage)].time;drawLessonScene();});
const lessonCanvas=$('lesson-canvas');
lessonCanvas.addEventListener('pointerdown',e=>{
 if(lessonIndex!==1||e.pointerType==='touch')return;
 reconstructionDrag=[e.clientX,e.clientY];lessonCanvas.setPointerCapture(e.pointerId);lessonCanvas.focus();
});
lessonCanvas.addEventListener('pointermove',e=>{
 if(!reconstructionDrag||lessonIndex!==1)return;
 reconstructionView.yaw=Math.max(-.7,Math.min(.7,reconstructionView.yaw+(e.clientX-reconstructionDrag[0])*.006));
 reconstructionView.pitch=Math.max(-.25,Math.min(.45,reconstructionView.pitch+(e.clientY-reconstructionDrag[1])*.004));
 reconstructionDrag=[e.clientX,e.clientY];drawLessonScene();
});
for(const name of ['pointerup','pointercancel','lostpointercapture'])lessonCanvas.addEventListener(name,()=>reconstructionDrag=null);
lessonCanvas.addEventListener('keydown',e=>{
 if(lessonIndex!==1||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','0'].includes(e.key))return;e.preventDefault();
 if(e.key==='0'){reconstructionView.yaw=0;reconstructionView.pitch=0;}
 else if(e.key==='ArrowLeft'||e.key==='ArrowRight')reconstructionView.yaw=Math.max(-.7,Math.min(.7,reconstructionView.yaw+(e.key==='ArrowLeft'?-.08:.08)));
 else reconstructionView.pitch=Math.max(-.25,Math.min(.45,reconstructionView.pitch+(e.key==='ArrowUp'?-.06:.06)));
 drawLessonScene();
});
selectLesson(new URLSearchParams(location.search).get('lesson')==='reconstruction'?1:0);



$$('[data-lesson-link]').forEach(link=>link.addEventListener('click',()=>selectLesson(Number(link.dataset.lessonLink))));

const ranges={frequency:[.08,.4],noise:[0,1.5],history:[.05,1.25],gain:[2,40]};
let playing=false,simulation,chartKind='tracking',accumulator=0,lastFrame=0,lastUI=0,lastLessonFrame=0,toastTimer;
function validatedConfig(candidate){
 const c={...DEFAULTS,mode:'tracking',motion:'circle'};
 for(const [key,[low,high]] of Object.entries(ranges)){const v=Number(candidate[key]);if(Number.isFinite(v))c[key]=Math.min(high,Math.max(low,v));}
 c.gain=Math.round(c.gain);
 if(['ra','sdob','dob','mpc'].includes(candidate.method))c.method=candidate.method;
 if(c.method==='sdob')c.history=.05;
 c.counts=c.method==='sdob'?[0,0,0,DEFAULTS.counts[3]]:[...DEFAULTS.counts];c.weighting=c.method==='sdob'?'global':'grouped';return c;
}
function readConfig(){const c={method:$('method').value};for(const key of Object.keys(ranges))c[key]=$(key).value;return validatedConfig(c);}
function applyConfig(c){
 c=validatedConfig(c);for(const key of Object.keys(ranges))$(key).value=c[key];$('method').value=c.method;syncControls();
}
function syncControls(){
 $('history').disabled=$('method').value==='sdob';
 if($('history').disabled)$('history').value=.05;
 const units={frequency:' Hz',noise:' px',history:' s',gain:''};
 for(const [key,unit] of Object.entries(units))$(`${key}-value`).textContent=Number($(key).value).toFixed(key==='gain'?0:2)+unit;
}
let toastMessage='';
function toast(message){toastMessage=message;$('toast').textContent=t(message);$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4200);}
function pause(){playing=false;$('play').textContent=t(simulation&&simulation.t>=24?'↺ Run again':'▶ Resume');}
function resetSimulation(showMessage=false){
 pause();simulation=new Simulation(readConfig());accumulator=0;$('play').textContent=t('▶ Start simulation');
 refreshChartCopy();render(true);if(showMessage)toast('Settings updated and simulation reset. Press Start to run.');
}
for(const key of [...Object.keys(ranges),'method']){
 $(key).addEventListener('input',syncControls);
 $(key).addEventListener('change',()=>{
  if(key==='method')$('history').value=$('method').value==='sdob'?.05:DEFAULTS.history;
  syncControls();resetSimulation(true);
 });
}
$('reset-settings').onclick=()=>{applyConfig(DEFAULTS);resetSimulation();toast('Default settings restored.');};
$('play').onclick=()=>{if(playing){pause();return;}if(simulation.t>=24)resetSimulation();playing=true;$('play').textContent=t('Ⅱ Pause');};
$('step').onclick=()=>{pause();simulation.step();if(simulation.t>=24)pause();render(true);};$('reset').onclick=()=>resetSimulation();
$$('[data-chart]').forEach(b=>b.onclick=()=>{
 chartKind=b.dataset.chart;$$('[data-chart]').forEach(x=>x.classList.toggle('active',x===b));
 $$('[data-chart]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
 refreshChartCopy();
 render(true);
});
function refreshChartCopy(){
 const titles={x:'Target disturbance · horizontal',y:'Target disturbance · vertical',error:'Current disturbance estimation error',tracking:'Corner tracking error'};
 $('chart-title').textContent=t(titles[chartKind]);
 $('chart-legend').innerHTML=chartKind==='tracking'?`<span><i style="--dot:#147d6c"></i>${t('Corner RMSE')}</span>`:`${chartKind==='error'?'':`<span><i style="--dot:#697785"></i>${t('Ground truth (evaluation only)')}</span>`}<span><i style="--dot:#147d6c"></i>${simulation.config.method==='sdob'?'SDOB':'RA-SDOB'}</span><span><i style="--dot:#b56e18"></i>DOB</span>`;
}
function render(force=false){
 if(!simulation)return;const r=simulation.latest;
 labRobot?.render({time:simulation.t,camera:r.camera,target:r.target,mode:simulation.config.mode,candidates:simulation.observer.candidates.slice().sort((a,b)=>b.weight-a.weight).slice(0,6).map(candidate=>Array.from({length:16},(_,n)=>simulation.observer.position(candidate,n*.025)))});drawImage($('image-canvas'),simulation);drawChart($('chart-canvas'),simulation,chartKind);
 $('sim-progress').style.width=`${simulation.t/24*100}%`;
 $('visibility').textContent=t(r.visible?'Features visible':'Features out of view');$('visibility').style.color=r.visible?'':'#e3af77';
 const insufficient=simulation.config.counts[2]>0&&simulation.config.counts[0]===0&&simulation.config.counts[1]===0&&!(simulation.config.counts[3]>0)&&simulation.config.history<.2;
 const hint=insufficient?'Circular fitting needs at least 5 frames. Set the observation window to 0.20 s or longer.':!r.visible?'The target is outside the field of view. Feature observations are paused. Reduce the motion frequency.':simulation.t===0?'Press Start. The target begins moving immediately.':'Every 0.05 s, update estimates, plan ahead and apply the first command.';
 $('experiment-hint').textContent=t(hint);
}
$('share-config').onclick=async()=>{
 const url=new URL(location.href);url.search='';url.searchParams.set('experiment',JSON.stringify(readConfig()));url.hash='lab';
 try{await navigator.clipboard.writeText(url.href);toast('Experiment link copied. It restores the same settings and random seed.');}
 catch{const input=document.createElement('input');input.value=url.href;input.readOnly=true;input.setAttribute('aria-label',t('Experiment link. Press Ctrl+C to copy.'));input.className='share-fallback';input.style.cssText='width:100%;padding:10px;margin-top:12px;background:#e8efdf;color:#233e2b';$('share-config').after(input);input.focus();input.select();toast('Copy the selected experiment link.');}
};
$$('[data-evidence-motion]').forEach(button=>button.onclick=()=>{
 const motion=button.dataset.evidenceMotion;
 ['line','circle'].forEach(name=>$(`evidence-${name}`).hidden=name!==motion);
 $$('[data-evidence-motion]').forEach(b=>{const active=b===button;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
});
let initial={...DEFAULTS};
try{const encoded=new URLSearchParams(location.search).get('experiment');if(encoded)initial=validatedConfig(JSON.parse(encoded));}catch{toast('Invalid experiment settings in the link. Defaults loaded.');}
applyConfig(initial);resetSimulation();
let visibleLesson=true,visibleLab=true;
const observer=new IntersectionObserver(entries=>{for(const e of entries){if(e.target.id==='lesson-panel')visibleLesson=e.isIntersecting;if(e.target.id==='lab'){visibleLab=e.isIntersecting;if(visibleLab)loadRobotView();}}},{rootMargin:'120px'});
[$('lesson-panel'),$('lab')].forEach(e=>observer.observe(e));
function frame(timestamp){
 const dt=lastFrame?Math.min((timestamp-lastFrame)/1000,.1):0;lastFrame=timestamp;
 if(!document.hidden){
  if(lessonIndex===1){if(visibleLesson&&reconstructionPlaying){lessonTime=Math.min(RECONSTRUCTION_DURATION,lessonTime+dt);if(lessonTime>=RECONSTRUCTION_DURATION){reconstructionPlaying=false;drawLessonScene();}}}
  else if(lessonIndex>=2){if(visibleLesson&&estimationPlaying){lessonTime=Math.min(ESTIMATION_DURATION,lessonTime+dt);if(lessonTime>=ESTIMATION_DURATION){estimationPlaying=false;drawLessonScene();}}}
  else if(!reduced||lessonPlaying)lessonTime+=dt;
  if(visibleLesson){if(lessonPlaying){lessonTimer+=dt;const duration=lessonIndex===1?RECONSTRUCTION_DURATION:lessonIndex>=2?ESTIMATION_DURATION:10;if(lessonTimer>=duration+1){if(lessonIndex===lessons.length-1){lessonPlaying=false;$('lesson-play').textContent=t('▶ Replay tour');}else{selectLesson(lessonIndex+1);if(lessonIndex===1)reconstructionPlaying=true;if(lessonIndex>=2)estimationPlaying=true;}}}if(timestamp-lastLessonFrame>33&&(!reduced||lessonPlaying||reconstructionPlaying&&lessonIndex===1||estimationPlaying&&lessonIndex>=2)){drawLessonScene();lastLessonFrame=timestamp;}}
  if(playing){accumulator+=dt*Number($('playback').value);let count=0;while(accumulator>=H&&count<8){simulation.step();accumulator-=H;count++;if(simulation.t>=24){pause();break;}}}
  if(visibleLab&&(timestamp-lastUI>75)){render();lastUI=timestamp;}
 }
 requestAnimationFrame(frame);
}
document.addEventListener('visibilitychange',()=>{if(document.hidden&&playing){pause();toast('Simulation paused while the page is in the background.');}});
window.addEventListener('resize',()=>{labRobot?.resize();drawLessonScene();render(true);});
let modelStarted=false,modelFallback=false,modelReady=false;
function refreshModelCopy(){
 if(modelFallback)$('lab-model-status').textContent=t('Real-robot setup · Numerical simulation remains available');
 else if(modelReady)$('lab-model-status').textContent=t('Drag to rotate · Click, then scroll to zoom');
}

async function loadRobotView(){
 if(modelStarted)return;modelStarted=true;
 try {
  const {createRobotView}=await import('./robot-view.mjs?v=20261027corners1');
  const canvas=$('world-canvas');
  canvas.addEventListener('webglcontextlost',()=>showModelFallback(new Error('WebGL context lost. Reload to restore the model.')),{once:true});
  labRobot=await createRobotView(canvas,{interactive:true,variant:'lab'});
  render(true);
  modelReady=true;refreshModelCopy();
 }catch(error){showModelFallback(error);}
}
function showModelFallback(error){
 $('lab-view-reset').disabled=true;
 $('lab-model-fallback').hidden=false;
 modelFallback=true;refreshModelCopy();
 console.warn('Astribot lab viewer:',error);
}
window.addEventListener('pagehide',event=>{if(!event.persisted)labRobot?.dispose();});
requestAnimationFrame(frame);

onLanguageChange(()=>{
 refreshLessonCopy();reconstructionStage=-1;estimationStage=-1;drawLessonScene();
 $('lesson-play').textContent=t(lessonPlaying?'Ⅱ Pause tour':lessonIndex===lessons.length-1&&lessonTimer>=ESTIMATION_DURATION?'▶ Replay tour':'▶ Play tour');
 $('play').textContent=t(playing?'Ⅱ Pause':simulation.t>=24?'↺ Run again':simulation.t===0?'▶ Start simulation':'▶ Resume');
 refreshChartCopy();refreshModelCopy();render(true);
 if(!$('toast').hidden&&toastMessage)$('toast').textContent=t(toastMessage);
 $$('.share-fallback').forEach(input=>input.setAttribute('aria-label',t('Experiment link. Press Ctrl+C to copy.')));
});
initializeLanguage();
