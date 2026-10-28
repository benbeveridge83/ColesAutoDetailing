/**
 * Browser-side photo editor for Parker's detailing gallery.
 * Resizes/crops locally and re-encodes as JPEG, stripping EXIF metadata
 * (including GPS coordinates), before an image is uploaded to Supabase.
 * Storage bucket accepts JPEG/PNG/WebP up to 5 MiB.
 */
const MB=1024*1024;
export const UPLOAD_LIMIT=5*MB;
const OUTPUT_TARGET=4.5*MB;
export const displayBytes=bytes=>bytes>=MB?(bytes/MB).toFixed(2)+' MB':(bytes/1024).toFixed(0)+' KB';

export function computeCrop(sourceWidth,sourceHeight,aspect='original',offsetX=.5,offsetY=.5){
  if(!(sourceWidth>0&&sourceHeight>0))throw new Error('This image has invalid dimensions.');
  let sw=sourceWidth,sh=sourceHeight;
  if(aspect!=='original'){
    const p=String(aspect).split(':').map(Number);
    const target=p[0]/p[1];
    if(!Number.isFinite(target)||target<=0)throw new Error('Unsupported crop ratio.');
    const ratio=sw/sh;
    if(ratio>target)sw=sh*target;
    else sh=sw/target;
  }
  const clamp=v=>Math.max(0,Math.min(1,Number(v)||0));
  return {x:Math.round((sourceWidth-sw)*clamp(offsetX)),y:Math.round((sourceHeight-sh)*clamp(offsetY)),
    width:Math.max(1,Math.round(sw)),height:Math.max(1,Math.round(sh))};
}

async function decode(file){
  if(typeof createImageBitmap==='function'){
    try{
      const bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});
      return {image:bitmap,width:bitmap.width,height:bitmap.height,cleanup:()=>bitmap.close()};
    }catch{/* Some browsers cannot decode HEIC. Try a regular image element. */}
  }
  const blobUrl=URL.createObjectURL(file);
  try{
    const image=new Image();
    image.decoding='async';
    image.src=blobUrl;
    await image.decode();
    return {image,width:image.naturalWidth,height:image.naturalHeight,cleanup:()=>URL.revokeObjectURL(blobUrl)};
  }catch{
    URL.revokeObjectURL(blobUrl);
    throw new Error('Your browser could not read this photo. Convert HEIC to JPG/PNG in the Photos app, then try again.');
  }
}
function canvasBlob(canvas,quality){
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Photo optimization failed.')), 'image/jpeg',quality));
}
export async function optimizePhoto(file,{aspect='original',offsetX=.5,offsetY=.5,maxDimension=1600}={}){
  if(!(file instanceof Blob))throw new Error('Choose a photo before uploading.');
  if(file.size>100*MB)throw new Error('This image is extremely large. Please choose a smaller original photo (under 100 MB).');
  const source=await decode(file);
  try{
    if(source.width*source.height>150000000)throw new Error('Image resolution is too large for this device.');
    const crop=computeCrop(source.width,source.height,aspect,offsetX,offsetY);
    const dimension=Math.min(2048,Math.max(600,Number(maxDimension)||1600));
    const scale=Math.min(1,dimension/Math.max(crop.width,crop.height));
    let targetW=Math.max(1,Math.round(crop.width*scale));
    let targetH=Math.max(1,Math.round(crop.height*scale));
    const canvas=document.createElement('canvas');
    const context=canvas.getContext('2d',{alpha:false});
    if(!context)throw new Error('Your device cannot process this photo.');
    let quality=.84,blob;
    for(let attempt=0;attempt<9;attempt++){
      canvas.width=targetW;canvas.height=targetH;
      context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';
      context.fillStyle='#ffffff';
      context.fillRect(0,0,targetW,targetH);
      context.drawImage(source.image,crop.x,crop.y,crop.width,crop.height,0,0,targetW,targetH);
      blob=await canvasBlob(canvas,quality);
      if(blob.size<=OUTPUT_TARGET)break;
      if(quality>.58)quality-=.08;
      else{targetW=Math.max(600,Math.round(targetW*.82));targetH=Math.max(1,Math.round(targetH*.82));quality=.76;}
    }
    if(!blob||blob.size>UPLOAD_LIMIT)throw new Error('This photo is still too big. Choose the smaller size setting and try again.');
    const base=String(file.name||'coles-photo').replace(/\.[^.]+$/,'').replace(/[^A-Za-z0-9_-]+/g,'-').slice(0,60)||'coles-photo';
    const processedFile=new File([blob],base+'.jpg',{type:'image/jpeg'});
    return {file:processedFile,width:targetW,height:targetH,originalBytes:file.size,optimizedBytes:blob.size};
  }finally{source.cleanup();}
}
