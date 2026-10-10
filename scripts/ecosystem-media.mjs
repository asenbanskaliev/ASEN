import {createHash} from "node:crypto";

/** Bounded metadata inspection only; no source artwork is executed or installed. */
export function inspectMedia(bytes,filename) {
  if(!Buffer.isBuffer(bytes)||bytes.length>20_000_000)throw new Error("Expected bounded media bytes");
  if(filename.endsWith(".png")){
    if(bytes.length<33||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||bytes.readUInt32BE(8)!==13||bytes.toString("ascii",12,16)!=="IHDR")throw new Error("Malformed PNG header");
    const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20),color=bytes[25];
    if(!width||!height||![0,2,3,4,6].includes(color))throw new Error("Invalid PNG dimensions/color");
    let offset=8,alpha=color===4||color===6,ended=false,imageData=false;
    while(offset<bytes.length){
      if(offset+12>bytes.length)throw new Error("Truncated PNG chunk");
      const size=bytes.readUInt32BE(offset),type=bytes.toString("ascii",offset+4,offset+8);
      if(size>bytes.length-offset-12)throw new Error("Truncated PNG data");
      if(type==="IHDR"&&offset!==8)throw new Error("Duplicate PNG header");
      if(type==="IDAT"&&size>0)imageData=true;
      if(type==="tRNS")alpha=true;
      offset+=size+12;if(type==="IEND"){if(size!==0)throw new Error("Invalid PNG ending");ended=true;break;}
    }
    if(!ended||offset!==bytes.length||!imageData)throw new Error("Missing PNG image data or invalid ending");
    return {type:"png",width,height,frames:1,alpha};
  }
  if(filename.endsWith(".gif")){
    if(bytes.length<14||!/^GIF8[79]a$/.test(bytes.toString("ascii",0,6)))throw new Error("Malformed GIF header");
    const width=bytes.readUInt16LE(6),height=bytes.readUInt16LE(8);
    if(!width||!height)throw new Error("Invalid GIF dimensions");
    let offset=13+(bytes[10]&128?3*(2**((bytes[10]&7)+1)):0),frames=0,alpha=false,ended=false;
    const blocks=()=>{for(;;){if(offset>=bytes.length)throw new Error("Truncated GIF blocks");const size=bytes[offset++];if(!size)return;if(offset+size>bytes.length)throw new Error("Truncated GIF block");offset+=size;}};
    while(offset<bytes.length){
      const tag=bytes[offset++];
      if(tag===0x3b){ended=true;break;}
      if(tag===0x21){
        if(offset>=bytes.length)throw new Error("Truncated GIF extension");
        const label=bytes[offset++];
        if(label===0xf9){if(offset+6>bytes.length||bytes[offset]!==4||bytes[offset+5]!==0)throw new Error("Invalid GIF control");alpha ||= Boolean(bytes[offset+1]&1);offset+=6;}
        else blocks();
      }else if(tag===0x2c){
        if(offset+9>bytes.length)throw new Error("Truncated GIF image");
        const packed=bytes[offset+8];offset+=9+(packed&128?3*(2**((packed&7)+1)):0);
        if(offset>=bytes.length||bytes[offset]<2||bytes[offset]>8)throw new Error("Invalid GIF image data");
        offset++;blocks();frames++;
      }else throw new Error("Unknown GIF block");
    }
    if(!ended||offset!==bytes.length||!frames)throw new Error("Missing or trailing GIF ending");
    return {type:"gif",width,height,frames,alpha};
  }
  if(filename.endsWith(".svg")){
    const text=new TextDecoder("utf-8",{fatal:true}).decode(bytes);
    if(/<!DOCTYPE|<!ENTITY/i.test(text))throw new Error("External SVG entities are forbidden");
    // Structural metadata inspection, not a raster decoder or full SVG semantic validator.
    const tokens=/<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<\/?[A-Za-z_][\w:.-]*(?:[^<>"']|"[^"]*"|'[^']*')*>|[^<]+/gy;
    const stack=[];let token,offset=0,root=null,closed=false;
    while((token=tokens.exec(text))){
      if(token.index!==offset)throw new Error("Malformed SVG document");offset=tokens.lastIndex;
      const value=token[0];
      if(value.startsWith("<!--")||value.startsWith("<?"))continue;
      if(value.startsWith("<![CDATA[")){if(!stack.length)throw new Error("SVG data outside root");continue;}
      if(!value.startsWith("<")){if(!stack.length&&value.trim())throw new Error("SVG text outside root");continue;}
      const closing=value.startsWith("</"),name=/^<\/?([\w:.-]+)/.exec(value)[1];
      if(closing){if(!/^<\/[\w:.-]+\s*>$/.test(value)||stack.pop()!==name)throw new Error("Unbalanced SVG tags");if(!stack.length)closed=true;}
      else {
        if(!stack.length){if(root||closed||name!=="svg")throw new Error("Invalid SVG root");root=[value,value.slice(4,-1)];}
        if(!/\/\s*>$/.test(value))stack.push(name);else if(!stack.length)closed=true;
      }
    }
    if(offset!==text.length||!root||!closed||stack.length)throw new Error("Malformed SVG document");
    const attr=name=>new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`,"i").exec(root[1])?.[1]??null;
    const viewBox=attr("viewBox");
    if(viewBox!==null&&(!/^\s*[-+\d.e]+(?:[\s,]+[-+\d.e]+){3}\s*$/i.test(viewBox)||viewBox.trim().split(/[\s,]+/).some(value=>!Number.isFinite(Number(value)))))throw new Error("Invalid SVG viewBox");
    return {type:"svg",width:attr("width"),height:attr("height"),viewBox};
  }
  throw new Error("Unsupported comparison media");
}

export function validateMediaManifest(baseline,manifest) {
  if(!manifest||manifest.version!==1||manifest.commit!==baseline.commit||!Array.isArray(manifest.sources))return ["Invalid media manifest"];
  const expected=baseline.files.filter(row=>/\.(?:svg|png|gif)$/.test(row.path)),byPath=new Map(expected.map(row=>[row.path,row])),issues=[];
  if(manifest.sources.length!==expected.length||new Set(manifest.sources.map(row=>row?.path)).size!==expected.length)issues.push("Every frozen media source requires exactly one inspection");
  for(const row of manifest.sources){
    const source=byPath.get(row?.path);
    if(!source||row.sha256!==source.sha256||row.objectId!==source.objectId||row.bytes!==source.bytes||typeof row.inspection!=="string"||!row.inspection.trim()) {issues.push("Media inspection identity mismatch");continue;}
    if(!row.path.endsWith("."+row.type))issues.push("Media format/path mismatch");
    if(row.type!=="svg"&&(!Number.isSafeInteger(row.width)||row.width<1||!Number.isSafeInteger(row.height)||row.height<1||!Number.isSafeInteger(row.frames)||row.frames<1||typeof row.alpha!=="boolean"))issues.push("Invalid raster metadata");
    if(row.type==="svg"&&(row.viewBox!==null&&typeof row.viewBox!=="string"||row.width!==null&&typeof row.width!=="string"||row.height!==null&&typeof row.height!=="string"))issues.push("Invalid vector metadata");
  }
  return issues;
}

export function verifyMediaBytes(source,inspection,bytes) {
  if(bytes.length!==source.bytes||createHash("sha256").update(bytes).digest("hex")!==source.sha256)throw new Error("Media bytes differ from frozen source");
  const metadata=inspectMedia(bytes,source.path);
  if(Object.entries(metadata).some(([key,value])=>inspection[key]!==value))throw new Error("Media inspection metadata differs from exact bytes");
  return true;
}
