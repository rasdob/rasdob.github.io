// Compact transport geometry expands to the existing WebGL vertex layout.
function invalid(detail){throw new Error(`Invalid Astribot geometry: ${detail}.`);}
function size(value,name){if(!Number.isSafeInteger(value)||value<=0)invalid(name);return value;}
function region(offset,length,total,alignment,name){
  if(!Number.isSafeInteger(offset)||offset<0||offset%alignment||!Number.isSafeInteger(length)||length<0||offset>total-length)invalid(name);
  return [offset,offset+length];
}
function bounds(value,dimensions,name){
  if(!Array.isArray(value)||value.length!==2||value.some(row=>!Array.isArray(row)||row.length!==dimensions))invalid(name);
  for(let i=0;i<dimensions;i++)if(!Number.isFinite(value[0][i])||!Number.isFinite(value[1][i])||!Number.isFinite(Math.fround(value[0][i]))||!Number.isFinite(Math.fround(value[1][i]))||value[0][i]>value[1][i])invalid(name);
}
function disjoint(regions){
  regions.sort((a,b)=>a[0]-b[0]);
  for(let i=1;i<regions.length;i++)if(regions[i][0]<regions[i-1][1])invalid('overlapping mesh regions');
}
export function decodeModelGeometry(model,buffer){
  if(!model||![2,3].includes(model.format)||model.vertexStride!==11)invalid('unsupported format');
  if(!(buffer instanceof ArrayBuffer)||buffer.byteLength!==size(model.byteLength,'byte length'))invalid('buffer size');
  if(model.format===2)return buffer;
  if(model.storageVertexBytes!==16)invalid('storage vertex size');
  const decodedSize=size(model.decodedByteLength,'decoded byte length');
  if(!Array.isArray(model.meshes)||!model.meshes.length)invalid('meshes');
  const packedRegions=[],decodedRegions=[];
  for(const mesh of model.meshes){
    size(mesh.vertexCount,'vertex count');size(mesh.indexCount,'index count');
    if(mesh.vertexCount>65536||mesh.indexCount%3)invalid('mesh counts');
    packedRegions.push(region(mesh.packedVertexOffset,mesh.vertexCount*16,buffer.byteLength,2,'packed vertices'),region(mesh.packedIndexOffset,mesh.indexCount*2,buffer.byteLength,2,'packed indices'));
    decodedRegions.push(region(mesh.vertexOffset,mesh.vertexCount*44,decodedSize,4,'decoded vertices'),region(mesh.indexOffset,mesh.indexCount*2,decodedSize,2,'decoded indices'));
    bounds(mesh.positionBounds,3,'position bounds');bounds(mesh.uvBounds,2,'UV bounds');
    if(!Array.isArray(mesh.baseColor)||mesh.baseColor.length!==3||mesh.baseColor.some(c=>!Number.isFinite(c)||c<0||c>1))invalid('base color');
  }
  disjoint(packedRegions);disjoint(decodedRegions);
  const result=new ArrayBuffer(decodedSize),source=new DataView(buffer),target=new DataView(result);
  for(const mesh of model.meshes){
    for(let i=0;i<mesh.vertexCount;i++){
      const input=mesh.packedVertexOffset+i*16,output=mesh.vertexOffset+i*44;
      for(let axis=0;axis<3;axis++){
        const q=source.getUint16(input+axis*2,true),[low,high]=mesh.positionBounds;
        target.setFloat32(output+axis*4,low[axis]+q*(high[axis]-low[axis])/65535,true);
        const normal=source.getInt16(input+6+axis*2,true);
        if(normal===-32768)invalid('normal range');
        target.setFloat32(output+12+axis*4,normal/32767,true);
        target.setFloat32(output+24+axis*4,mesh.baseColor[axis],true);
      }
      for(let axis=0;axis<2;axis++){
        const q=source.getUint16(input+12+axis*2,true),[low,high]=mesh.uvBounds;
        target.setFloat32(output+36+axis*4,low[axis]+q*(high[axis]-low[axis])/65535,true);
      }
    }
    for(let i=0;i<mesh.indexCount;i++){
      const index=source.getUint16(mesh.packedIndexOffset+i*2,true);
      if(index>=mesh.vertexCount)invalid('index range');
      target.setUint16(mesh.indexOffset+i*2,index,true);
    }
  }
  return result;
}
