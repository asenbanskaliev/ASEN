import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
// @ts-expect-error Comparison-only media validator does not ship in the runtime package.
import {inspectMedia,validateMediaManifest,verifyMediaBytes} from "../scripts/ecosystem-media.mjs";
import {createHash} from "node:crypto";

test("metadata inspection rejects PNG without image data and SVG hidden in comments",()=>{
  const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jQdQAAAAASUVORK5CYII=","base64");
  const chunks=[png.subarray(0,8)];
  for(let offset=8;offset<png.length;){const end=offset+png.readUInt32BE(offset)+12;if(png.toString("ascii",offset+4,offset+8)!=="IDAT")chunks.push(png.subarray(offset,end));offset=end;}
  assert.throws(()=>inspectMedia(Buffer.concat(chunks),"empty.png"));
  assert.throws(()=>inspectMedia(Buffer.from('<!-- <svg width="99" height="99"></svg> -->'),"comment.svg"));
  assert.throws(()=>inspectMedia(Buffer.from('<svg><g></svg>'),"unbalanced.svg"));
});

test("synthetic PNG/GIF/SVG metadata is bounded and malformed images fail closed",()=>{
  const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jQdQAAAAASUVORK5CYII=","base64");
  assert.deepEqual(inspectMedia(png,"one.png"),{type:"png",width:1,height:1,frames:1,alpha:true});
  const gif=Buffer.from("47494638396101000100800000000000ffffff2c00000000010001000002024401003b","hex");
  assert.deepEqual(inspectMedia(gif,"one.gif"),{type:"gif",width:1,height:1,frames:1,alpha:false});
  const animated=Buffer.concat([gif.subarray(0,-1),Buffer.from("21f9040100000000","hex"),gif.subarray(19)]);
  assert.deepEqual(inspectMedia(animated,"two.gif"),{type:"gif",width:1,height:1,frames:2,alpha:true},"later transparent frames must not be hidden by opaque first-frame metadata");
  const svg=Buffer.from('<svg width="10" height="20" viewBox="0 0 10 20"></svg>');
  assert.deepEqual(inspectMedia(svg,"one.svg"),{type:"svg",width:"10",height:"20",viewBox:"0 0 10 20"});
  for(const [bytes,name] of [[png.subarray(0,30),"one.png"],[png.subarray(0,png.length-1),"one.png"],[gif.subarray(0,gif.length-1),"one.gif"],[Buffer.from('<!DOCTYPE svg><svg></svg>'),"one.svg"],[Buffer.from('<svg viewBox="no"></svg>'),"one.svg"]] as const)
    assert.throws(()=>inspectMedia(bytes,name));
  const source={path:"one.svg",bytes:svg.length,sha256:createHash("sha256").update(svg).digest("hex")};
  assert.equal(verifyMediaBytes(source,inspectMedia(svg,"one.svg"),svg),true);
  assert.throws(()=>verifyMediaBytes(source,{...inspectMedia(svg,"one.svg"),width:"999"},svg),/metadata/);
  assert.throws(()=>verifyMediaBytes(source,{},Buffer.from("altered")),/frozen source/);
});
test("every checked-in source media inspection binds the frozen object identity",()=>{
  const baseline=JSON.parse(readFileSync(new URL("../registry/parity/ecosystem-sources-v1.json",import.meta.url),"utf8"));
  const manifest=JSON.parse(readFileSync(new URL("../registry/parity/ecosystem-media-v1.json",import.meta.url),"utf8"));
  assert.deepEqual(validateMediaManifest(baseline,manifest),[]);
  for(const mutate of [(m:any)=>m.sources.pop(),(m:any)=>{m.sources[0].sha256="a".repeat(64);},(m:any)=>{m.sources[0].frames=0;},(m:any)=>m.sources.push(m.sources[0])]){
    const altered=structuredClone(manifest);mutate(altered);assert.ok(validateMediaManifest(baseline,altered).length);
  }
});
