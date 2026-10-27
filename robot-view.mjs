import {identity,multiply,transform,point,vector,normalize,cross,dot,sub,forwardKinematics,solveRightArm,sceneFrame,planarPosition} from './robot-kinematics.mjs';
import {decodeModelGeometry} from './model-codec.mjs?v=20261027compact1';
import {MARKER_SIDE,DEPTH} from './engine.mjs?v=20261027compact1';

const MODEL_URL=new URL('./assets/astribot/model.json?v=20261027compact1',import.meta.url);
let sharedAssets;
let assetProgress={phase:'metadata',loaded:0,total:1,ratio:0};
const progressListeners=new Set();
function reportProgress(callback,progress){
  // A UI progress callback must not interrupt a shared asset download.
  try{callback?.(progress);}catch{}
}
function updateAssetProgress(phase,loaded,total){
  assetProgress={phase,loaded,total,ratio:total?loaded/total:0};
  for(const callback of progressListeners)reportProgress(callback,assetProgress);
}
function abortError(){return new DOMException('Robot viewer loading was cancelled.','AbortError');}
function checkAbort(signal){if(signal?.aborted)throw abortError();}
async function readGeometry(response,total){
  updateAssetProgress('geometry',0,total);
  if(!response.body?.getReader){
    const binary=await response.arrayBuffer();
    if(binary.byteLength!==total)throw new Error('Incomplete Astribot mesh file.');
    updateAssetProgress('geometry',total,total);return binary;
  }
  const bytes=new Uint8Array(total),reader=response.body.getReader();let loaded=0,lastPercent=-1;
  try{
    while(true){
      const {done,value}=await reader.read();if(done)break;
      if(loaded+value.byteLength>total)throw new Error('Unexpected Astribot mesh file size.');
      bytes.set(value,loaded);loaded+=value.byteLength;
      const percent=Math.floor(loaded/total*100);
      if(percent!==lastPercent){updateAssetProgress('geometry',loaded,total);lastPercent=percent;}
    }
    if(loaded!==total)throw new Error('Incomplete Astribot mesh file.');
    return bytes.buffer;
  }catch(error){await reader.cancel().catch(()=>{});throw error;}
  finally{reader.releaseLock();}
}
async function loadAssets(onProgress,signal){
  checkAbort(signal);
  const listener=onProgress?progress=>reportProgress(onProgress,progress):null;
  if(listener){progressListeners.add(listener);reportProgress(listener,assetProgress);}
  if(!sharedAssets)sharedAssets=(async()=>{
    updateAssetProgress('metadata',0,1);
    const response=await fetch(MODEL_URL);if(!response.ok)throw new Error('Astribot model could not be loaded.');
    const model=await response.json();
    if(![2,3].includes(model.format)||model.vertexStride!==11)throw new Error('Robot assets need to be updated; reload the page.');
    if(!Number.isSafeInteger(model.byteLength)||model.byteLength<=0)throw new Error('Invalid Astribot mesh file size.');
    updateAssetProgress('metadata',1,1);
    const paths=[...new Set(model.meshes.map(mesh=>mesh.texture).filter(Boolean))],requestController=new AbortController();
    let decoded=0,geometryDone=false;
    const imageRequest=Promise.all(paths.map(async path=>{
      const image=await loadTextureImage(new URL(path,MODEL_URL),requestController.signal);decoded++;
      if(geometryDone)updateAssetProgress('textures',decoded,paths.length);
      return [path,image];
    }));
    const geometryRequest=(async()=>{
      const data=await fetch(new URL(model.binary,MODEL_URL),{signal:requestController.signal});
      if(!data.ok)throw new Error('Astribot meshes could not be loaded.');
      const compressed=model.compression==='gzip';
      if(model.compression&&!compressed)throw new Error('Unsupported Astribot mesh compression.');
      const downloadBytes=compressed?model.downloadBytes:model.byteLength;
      if(!Number.isSafeInteger(downloadBytes)||downloadBytes<=0)throw new Error('Invalid Astribot download size.');
      let binary=await readGeometry(data,downloadBytes);
      if(compressed){
        if(typeof DecompressionStream!=='function')throw new Error('This browser cannot decode the Astribot model.');
        const stream=new Blob([binary]).stream().pipeThrough(new DecompressionStream('gzip'));
        binary=await new Response(stream).arrayBuffer();
        if(binary.byteLength!==model.byteLength)throw new Error('Incomplete Astribot mesh file.');
      }
      binary=decodeModelGeometry(model,binary);
      geometryDone=true;
      updateAssetProgress('textures',decoded,paths.length);return binary;
    })();
    // Both are CPU assets. No GPU upload can outlive a failed sibling request.
    let binary,images;
    try{[binary,images]=await Promise.all([geometryRequest,imageRequest]);}
    catch(error){requestController.abort();await Promise.allSettled([geometryRequest,imageRequest]);throw error;}
    return {model,binary,images:new Map(images)};
  })().catch(error=>{sharedAssets=null;assetProgress={phase:'metadata',loaded:0,total:1,ratio:0};throw error;});
  let removeAbort=()=>{};
  try{
    if(!signal)return await sharedAssets;
    checkAbort(signal);
    const cancelled=new Promise((_,reject)=>{const cancel=()=>reject(abortError());signal.addEventListener('abort',cancel,{once:true});removeAbort=()=>signal.removeEventListener('abort',cancel);});
    return await Promise.race([sharedAssets,cancelled]);
  }finally{removeAbort();if(listener)progressListeners.delete(listener);}
}
export function perspective(fov,aspect,near,far){const f=1/Math.tan(fov/2),m=new Float64Array(16);m[0]=f/aspect;m[5]=f;m[10]=(far+near)/(near-far);m[11]=-1;m[14]=2*far*near/(near-far);return m;}
export function lookAt(eye,center){const z=normalize(sub(eye,center)),x=normalize(cross([0,0,1],z)),y=cross(z,x);return new Float64Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1]);}
export function getViewProjection({variant='hero',aspect=1,yaw=-.98,pitch=.28,distance=variant==='lab'?2.8:3}={}) {
  const center=variant==='lab'?[.38,-.12,.84]:[.35,-.08,.84];
  const fittedDistance=distance*Math.max(1,1.0/aspect);
  const eye=[center[0]+fittedDistance*Math.cos(pitch)*Math.cos(yaw),center[1]+fittedDistance*Math.cos(pitch)*Math.sin(yaw),center[2]+fittedDistance*Math.sin(pitch)];
  return {eye,vp:multiply(perspective(.68,aspect,.03,30),lookAt(eye,center))};
}
function basisMatrix(origin,right,up,back,scale=[1,1,1]){const m=identity();for(let i=0;i<3;i++){m[i]=right[i]*scale[0];m[4+i]=up[i]*scale[1];m[8+i]=back[i]*scale[2];m[12+i]=origin[i];}return m;}
function scaled(m,scale){const r=new Float64Array(m);for(let i=0;i<3;i++)for(let j=0;j<3;j++)r[4*i+j]*=scale[i];return r;}
const vertexSource=`attribute vec3 aPosition;attribute vec3 aNormal;attribute vec3 aColor;attribute vec2 aUV;
uniform mat4 uModel;uniform mat4 uVP;uniform mat3 uNormal;
varying vec3 vNormal;varying vec3 vWorld;varying vec3 vColor;varying vec2 vUV;
void main(){vec4 p=uModel*vec4(aPosition,1.);vWorld=p.xyz;vNormal=normalize(uNormal*aNormal);vColor=aColor;vUV=aUV;gl_Position=uVP*p;}`;
const fragmentSource=`precision highp float;
varying vec3 vNormal;varying vec3 vWorld;varying vec3 vColor;varying vec2 vUV;
uniform vec3 uEye;uniform vec3 uTint;uniform float uOpacity;uniform float uUnlit;
uniform sampler2D uTexture;uniform float uTextured;uniform float uRoughness;uniform float uMetallic;
const float PI=3.14159265;
vec3 srgbToLinear(vec3 c){return mix(c/12.92,pow((c+.055)/1.055,vec3(2.4)),step(vec3(.04045),c));}
vec3 linearToSrgb(vec3 c){return mix(c*12.92,1.055*pow(max(c,vec3(0.)),vec3(1./2.4))-.055,step(vec3(.0031308),c));}
vec3 filmic(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
vec3 softbox(vec3 base,vec3 n,vec3 v,vec3 l,vec3 radiance){
 vec3 h=normalize(v+l);float nl=max(dot(n,l),0.),nv=max(dot(n,v),.001),nh=max(dot(n,h),0.);
 float rough=max(uRoughness,.12),a=rough*rough,aa=a*a;
 float denom=nh*nh*(aa-1.)+1.;float d=aa/max(PI*denom*denom,.00001);
 float k=(rough+1.)*(rough+1.)/8.;float g=(nv/(nv*(1.-k)+k))*(nl/max(nl*(1.-k)+k,.001));
 vec3 f0=mix(vec3(.04),base,uMetallic);vec3 f=f0+(1.-f0)*pow(1.-max(dot(v,h),0.),5.);
 vec3 spec=d*g*f/max(4.*nv*nl,.001);vec3 diff=(1.-f)*(1.-uMetallic)*base/PI;
 return (diff+spec)*radiance*nl;
}
void main(){
 vec3 tex=srgbToLinear(texture2D(uTexture,vUV).rgb);
 vec3 base=vColor*uTint*mix(vec3(1.),tex,uTextured);
 if(uUnlit>.5){gl_FragColor=vec4(vColor*uTint,uOpacity);return;}
 vec3 n=normalize(vNormal);if(!gl_FrontFacing)n=-n;vec3 v=normalize(uEye-vWorld);
 vec3 hemisphere=mix(vec3(.22,.235,.255),vec3(.55,.57,.60),n.z*.5+.5);
 vec3 color=base*hemisphere*(1.-.7*uMetallic);
 color+=softbox(base,n,v,normalize(vec3(.5,-.65,1.)),vec3(2.7,2.65,2.6));
 color+=softbox(base,n,v,normalize(vec3(-.7,.25,.5)),vec3(.95,1.03,1.16));
 color+=softbox(base,n,v,normalize(vec3(.15,1.,.65)),vec3(1.25,1.3,1.4));
 gl_FragColor=vec4(linearToSrgb(filmic(color*.92)),uOpacity);
}`;
// Rigid transforms with nonuniform scale (the camera/marker primitives) need
// the inverse-transpose normal matrix, rather than their position matrix.
export function normalMatrix(m){
 const a=[m[0],m[1],m[2]],b=[m[4],m[5],m[6]],c=[m[8],m[9],m[10]];
 const bc=cross(b,c),ca=cross(c,a),ab=cross(a,b),det=dot(a,bc);
 if(Math.abs(det)<1e-12)return new Float32Array([1,0,0,0,1,0,0,0,1]);
 return new Float32Array([...bc,...ca,...ab].map(x=>x/det));
}
function loadTextureImage(url,signal){return new Promise((resolve,reject)=>{
  const image=new Image();
  const finish=(error)=>{signal?.removeEventListener('abort',cancel);image.onload=null;image.onerror=null;error?reject(error):resolve(image);};
  const cancel=()=>{finish(abortError());image.src='';};
  image.onload=()=>finish();image.onerror=()=>finish(new Error('Robot surface texture could not be loaded: '+url.pathname));
  signal?.addEventListener('abort',cancel,{once:true});image.src=url.href;
});}

function program(gl){
  const shaders=[];let p;
  try{
    const precision=gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER,gl.HIGH_FLOAT);
    const fragment=precision?.precision?fragmentSource:fragmentSource.replace('precision highp float;','precision mediump float;');
    const vertex=precision?.precision?vertexSource:vertexSource.replaceAll('varying vec','varying mediump vec');
    for(const [type,source] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]]){const s=gl.createShader(type);if(!s)throw new Error('Robot shader allocation failed.');shaders.push(s);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));}
    p=gl.createProgram();if(!p)throw new Error('Robot shader program allocation failed.');shaders.forEach(s=>gl.attachShader(p,s));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));return p;
  }catch(error){if(p)gl.deleteProgram(p);throw error;}
  finally{shaders.forEach(s=>gl.deleteShader(s));}
}
function cubeVertices(){const out=[];for(let axis=0;axis<3;axis++)for(const sign of [-1,1]){const others=[0,1,2].filter(i=>i!==axis),normal=[0,0,0];normal[axis]=sign;const pts=[[-1,-1],[1,-1],[1,1],[-1,1]].map(p=>{const v=[0,0,0];v[axis]=sign*.5;v[others[0]]=p[0]*.5;v[others[1]]=p[1]*.5;return v;});for(const i of (sign*(axis===1?-1:1)>0?[0,1,2,0,2,3]:[0,2,1,0,3,2]))out.push(...pts[i],...normal,1,1,1);}return new Float32Array(out);}
function diskVertices(){const out=[];for(let i=0;i<64;i++){for(const angle of [null,i*Math.PI/32,(i+1)*Math.PI/32])out.push(...(angle===null?[0,0,0]:[Math.cos(angle),Math.sin(angle),0]),0,0,1,1,1,1);}return new Float32Array(out);}
function quadVertices(){return new Float32Array([-1,-1,0,0,0,1,1,1,1,1,-1,0,0,0,1,1,1,1,1,1,0,0,0,1,1,1,1,-1,-1,0,0,0,1,1,1,1,1,1,0,0,0,1,1,1,1,-1,1,0,0,0,1,1,1,1]);}
function markerVertices(){
  // Match the image marker's size and white border on both sides of the plate.
  const cube=cubeVertices(),out=[],cell=MARKER_SIDE*.82/6,bits=['111111','100101','110001','101101','100011','111111'];
  for(let y=0;y<6;y++)for(let x=0;x<6;x++)if(bits[y][x]==='1')for(const side of [-1,1]){
    for(let v=0;v<cube.length;v+=9)out.push(cube[v]*cell*1.01+(x-2.5)*cell,cube[v+1]*cell*1.01+(2.5-y)*cell,cube[v+2]*.0006+side*.0032,...cube.subarray(v+3,v+9));
  }
  return new Float32Array(out);
}

/** Native WebGL viewer: authentic S1 mesh/FK, position IK for visual motion only.
 * camera/target: [horizontal, image-down vertical] offsets in metres from home.
 * candidates: optional array of {points:[[x,y],...]} in the same target plane.
 * onProgress reports {phase,loaded,total,ratio}; geometry units are bytes,
 * textures/GPU units are completed items. A signal cancels only this instance.
 * No observer or controller state is modified by this viewer.
 */
export async function createRobotView(canvas,{interactive=true,variant='hero',onProgress,signal}={}){
  checkAbort(signal);
  const gl=canvas.getContext('webgl',{alpha:false,antialias:true,powerPreference:'low-power'});
  if(!gl)throw new Error('WebGL is unavailable in this browser.');
  const {model,binary,images}=await loadAssets(onProgress,signal);
  checkAbort(signal);
  const attributes={},uniforms={},buffers=[],textures=[],listeners=[];
  let shader=null,disposed=false,resizeObserver;
  const dispose=()=>{if(disposed)return;disposed=true;resizeObserver?.disconnect();listeners.forEach(([n,fn,opts])=>canvas.removeEventListener(n,fn,opts));buffers.forEach(b=>gl.deleteBuffer(b));textures.forEach(t=>gl.deleteTexture(t));if(shader)gl.deleteProgram(shader);};
  const checkLoading=()=>{checkAbort(signal);if(gl.isContextLost())throw new Error('Robot WebGL context was lost during loading.');};
  try{
  checkLoading();shader=program(gl);
  for(const name of ['Position','Normal','Color','UV'])attributes[name]=gl.getAttribLocation(shader,'a'+name);
  for(const name of ['Model','VP','Normal','Eye','Tint','Opacity','Unlit','Texture','Textured','Roughness','Metallic'])uniforms[name]=gl.getUniformLocation(shader,'u'+name);
  function makeBuffer(data,target=gl.ARRAY_BUFFER,usage=gl.STATIC_DRAW){const b=gl.createBuffer();if(!b)throw new Error('Robot GPU buffer allocation failed.');buffers.push(b);gl.bindBuffer(target,b);gl.bufferData(target,data,usage);return b;}
  const surfaceTextures=new Map();
  function uploadTexture(image){
    const texture=gl.createTexture();if(!texture)throw new Error('Robot GPU texture allocation failed.');textures.push(texture);gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
    if(image)gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
    else gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([255,255,255,255]));
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    const powerOfTwo=n=>(n&(n-1))===0;
    if(image&&powerOfTwo(image.width)&&powerOfTwo(image.height)){gl.generateMipmap(gl.TEXTURE_2D);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);}
    else gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    return texture;
  }
  const gpuTotal=images.size+model.meshes.length+1;let gpuDone=0;
  const progressGPU=()=>reportProgress(onProgress,{phase:'gpu',loaded:gpuDone,total:gpuTotal,ratio:gpuDone/gpuTotal});
  progressGPU();
  const plainTexture=uploadTexture();gpuDone++;progressGPU();
  for(const [path,image] of images){checkLoading();surfaceTextures.set(path,uploadTexture(image));gpuDone++;progressGPU();}
  const meshes=[];
  for(let i=0;i<model.meshes.length;i++){
    checkLoading();const mesh=model.meshes[i];
    meshes.push({vertex:makeBuffer(new Float32Array(binary,mesh.vertexOffset,mesh.vertexCount*11)),index:makeBuffer(new Uint16Array(binary,mesh.indexOffset,mesh.indexCount),gl.ELEMENT_ARRAY_BUFFER),count:mesh.indexCount,texture:surfaceTextures.get(mesh.texture),material:mesh.material});
    gpuDone++;progressGPU();
    // Yield while uploading the full paper model so its poster/progress can paint.
    if((i+1)%8===0)await new Promise(resolve=>setTimeout(resolve,0));
  }
  checkLoading();
  const cube=makeBuffer(cubeVertices()),disk=makeBuffer(diskVertices()),quad=makeBuffer(quadVertices()),lines=makeBuffer(new Float32Array(0),gl.ARRAY_BUFFER,gl.DYNAMIC_DRAW);
  const markerData=markerVertices(),marker=makeBuffer(markerData);
  const geometryTransforms=model.geoms.map(g=>transform(g.pos,g.quat));
  const frame=sceneFrame(model);
  let yaw=-.98,pitch=.28,distance=variant==='lab'?2.8:3.0,q={...model.home},fk=forwardKinematics(model),lastCamera=[NaN,NaN],lastState={},drag=null;
  function on(name,fn,options){canvas.addEventListener(name,fn,options);listeners.push([name,fn,options]);}
  function bind(buffer,textured=false){gl.bindBuffer(gl.ARRAY_BUFFER,buffer);const stride=textured?44:36;
    for(const [i,name] of ['Position','Normal','Color'].entries()){gl.enableVertexAttribArray(attributes[name]);gl.vertexAttribPointer(attributes[name],3,gl.FLOAT,false,stride,i*12);}
    if(textured){gl.enableVertexAttribArray(attributes.UV);gl.vertexAttribPointer(attributes.UV,2,gl.FLOAT,false,44,36);}
    else{gl.disableVertexAttribArray(attributes.UV);gl.vertexAttrib2f(attributes.UV,0,0);}
  }
  function draw(buffer,count,m=identity(),color=[1,1,1],opacity=1,unlit=0,mode=gl.TRIANGLES,index=null,surface=null){
    bind(buffer,!!surface);gl.uniformMatrix4fv(uniforms.Model,false,new Float32Array(m));gl.uniformMatrix3fv(uniforms.Normal,false,normalMatrix(m));gl.uniform3fv(uniforms.Tint,color);gl.uniform1f(uniforms.Opacity,opacity);gl.uniform1f(uniforms.Unlit,unlit);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,surface?.texture||plainTexture);gl.uniform1i(uniforms.Texture,0);gl.uniform1f(uniforms.Textured,surface?.texture?1:0);
    gl.uniform1f(uniforms.Roughness,surface?.material?.roughness??.4);gl.uniform1f(uniforms.Metallic,surface?.material?.metallic??.03);
    if(index){gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,index);gl.drawElements(mode,count,gl.UNSIGNED_SHORT,0);}else gl.drawArrays(mode,0,count);
  }
  function drawLines(segments,color,opacity=1){if(!segments.length)return;const v=[];for(const p of segments)v.push(...p,0,0,1,1,1,1);gl.bindBuffer(gl.ARRAY_BUFFER,lines);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(v),gl.DYNAMIC_DRAW);draw(lines,segments.length,identity(),color,opacity,1,gl.LINES);}
  function resize(){if(disposed)return;const ratio=Math.min(globalThis.devicePixelRatio||1,1.8),rect=canvas.getBoundingClientRect();const w=Math.max(1,Math.round(rect.width*ratio)),h=Math.max(1,Math.round(rect.height*ratio));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}}
  function render(state={}){
    if(disposed||gl.isContextLost())return false;
    lastState=state;const camera=state.camera||[0,0],target=state.target||[0,0];
    if(camera.some((v,i)=>v!==lastCamera[i])){const solved=solveRightArm(model,planarPosition(frame,camera),q);q=solved.q;fk=solved.fk;lastCamera=[...camera];}
    resize();gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(.965,.969,.975,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.useProgram(shader);
    const {eye,vp}=getViewProjection({variant,aspect:canvas.width/canvas.height,yaw,pitch,distance});
    gl.uniformMatrix4fv(uniforms.VP,false,new Float32Array(vp));gl.uniform3fv(uniforms.Eye,eye);
    draw(quad,6,scaled(transform([0,0,-.006]),[5,5,1]),[.952,.958,.966],1,1);
    if(variant==='lab'){const grid=[];for(let x=-2;x<=2.001;x+=.5)grid.push([x,-2,-.004],[x,2,-.004],[-2,x,-.004],[2,x,-.004]);drawLines(grid,[.86,.88,.91],.26);}
    gl.depthMask(false);
    for(let i=12;i>0;i--)draw(disk,192,scaled(transform([.02,.02,.001+(13-i)*.0001]),[.27+i*.028,.25+i*.025,1]),[.27,.32,.4],.014,1);
    gl.depthMask(true);
    model.geoms.forEach((geom,i)=>{const mesh=meshes[geom.mesh];draw(mesh.vertex,mesh.count,multiply(fk.world[geom.body],geometryTransforms[i]),[1,1,1],1,0,gl.TRIANGLES,mesh.index,mesh);});
    // Satin wrist camera housing at the MJCF mounting, an illustrative enclosure.
    const cameraWorld=fk.camera;
    draw(cube,36,scaled(multiply(cameraWorld,transform([0,0,.007])),[.08,.028,.024]),[.50,.56,.62]);
    for(const x of [-.025,.025])draw(cube,36,scaled(multiply(cameraWorld,transform([x,0,-.006])),[.014,.014,.003]),[.035,.06,.1]);
    const targetWorld=planarPosition(frame,target,DEPTH),back=frame.forward.map(x=>-x),markerBasis=basisMatrix(targetWorld,frame.right,frame.up,back);
    draw(cube,36,scaled(markerBasis,[MARKER_SIDE,MARKER_SIDE,.006]),[.99,.99,.99]);
    // A conceptual fiducial pattern, not an ArUco dictionary claim.
    draw(marker,markerData.length/9,markerBasis,[.035,.055,.085],1,1);
    const camPos=point(cameraWorld),half=MARKER_SIDE/2,corners=[[-half,-half],[half,-half],[half,half],[-half,half]].map(p=>targetWorld.map((v,i)=>v+frame.right[i]*p[0]+frame.up[i]*p[1]));
    const rays=[];for(let i=0;i<4;i++)rays.push(camPos,corners[i],corners[i],corners[(i+1)%4]);gl.depthMask(false);drawLines(rays,[.3,.51,.93],.2);gl.depthMask(true);
    for(const candidate of (state.candidates||[]).slice(0,6)){
      const pts=candidate.points||candidate;if(!Array.isArray(pts)||pts.length<2)continue;
      const segments=[];for(let i=1;i<pts.length;i++)if(Array.isArray(pts[i])&&Array.isArray(pts[i-1]))segments.push(planarPosition(frame,pts[i-1],DEPTH),planarPosition(frame,pts[i],DEPTH));
      drawLines(segments,[.24,.53,.93],.25);
    }
    return true;
  }
  function resetView(){yaw=-.98;pitch=.28;distance=variant==='lab'?2.8:3;render(lastState);}
  if(interactive){
    canvas.style.touchAction='pan-y';
    on('pointerdown',e=>{if(e.button!==0)return;canvas.focus({preventScroll:true});drag={x:e.clientX,y:e.clientY,id:e.pointerId};canvas.setPointerCapture(e.pointerId);});
    on('pointermove',e=>{if(!drag||e.pointerId!==drag.id)return;yaw-=(e.clientX-drag.x)*.007;pitch=Math.max(-.05,Math.min(1.2,pitch+(e.clientY-drag.y)*.007));drag={x:e.clientX,y:e.clientY,id:e.pointerId};render(lastState);});
    const end=e=>{if(drag&&e.pointerId===drag.id)drag=null;};on('pointerup',end);on('pointercancel',end);on('lostpointercapture',()=>{drag=null;});
    on('wheel',e=>{if(!e.ctrlKey&&!e.metaKey&&!canvas.matches(':focus'))return;e.preventDefault();distance=Math.max(1.6,Math.min(5.5,distance*Math.exp(e.deltaY*.001)));render(lastState);},{passive:false});
    on('dblclick',resetView);
    on('keydown',e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-','0'].includes(e.key)){e.preventDefault();if(e.key==='0'){resetView();return;}if(e.key==='ArrowLeft')yaw-=.1;if(e.key==='ArrowRight')yaw+=.1;if(e.key==='ArrowUp')pitch=Math.min(1.2,pitch+.08);if(e.key==='ArrowDown')pitch=Math.max(-.05,pitch-.08);if(e.key==='+')distance=Math.max(1.6,distance*.9);if(e.key==='-')distance=Math.min(5.5,distance/ .9);render(lastState);}});
  }
  if(typeof ResizeObserver!=='undefined'){resizeObserver=new ResizeObserver(()=>render(lastState));resizeObserver.observe(canvas);}
  checkLoading();if(!render())throw new Error('Robot WebGL context was lost before rendering.');
  const gpuError=gl.getError();
  if(gpuError!==gl.NO_ERROR)throw new Error('Robot GPU setup failed (WebGL error '+gpuError+').');
  reportProgress(onProgress,{phase:'ready',loaded:1,total:1,ratio:1});
  return {render,resize,resetView,dispose};
  }catch(error){dispose();throw error;}
}
