import {writerAParitySlices} from "./writer-a/index.mjs";
import {writerBParitySlices} from "./writer-b/index.mjs";

const DESCRIPTOR_KEYS=["fixturePath","id","load","successLabel","validate"];
const FIXTURE_PATH=/^registry\/parity\/[A-Za-z0-9][A-Za-z0-9._-]*\.json$/;
const message=error=>{
 if(typeof error==="string")return error;
 try{if(error instanceof Error&&typeof error.message==="string")return error.message;}catch{}
 try{return String(error);}catch{return "[unprintable thrown value]";}
};

export function composeAdditionalParitySlices(registries){
 if(!Array.isArray(registries)||registries.length!==2||registries[0]?.writer!=="A"||registries[1]?.writer!=="B")
  throw new Error("registries must be ordered writer A then writer B");
 const slices=[],ids=new Set(),paths=new Set();
 for(const registry of registries){
  if(!Array.isArray(registry.slices)||!Object.isFrozen(registry.slices))throw new Error(`writer ${registry.writer} registry must be a frozen array`);
  for(const slice of registry.slices){
   if(!slice||typeof slice!=="object"||!Object.isFrozen(slice))throw new Error("additional parity slice must be a frozen descriptor");
   if(Object.keys(slice).sort().join("\n")!==DESCRIPTOR_KEYS.join("\n"))throw new Error("additional parity descriptor has unknown or missing properties");
   if(typeof slice.id!=="string"||slice.id.trim()!==slice.id||!slice.id)throw new Error("additional parity descriptor id must be a nonempty trimmed string");
   if(ids.has(slice.id))throw new Error(`duplicate descriptor id: ${slice.id}`);
   if(typeof slice.fixturePath!=="string"||!FIXTURE_PATH.test(slice.fixturePath))throw new Error(`fixturePath must be canonical registry/parity/*.json: ${slice.fixturePath}`);
   if(paths.has(slice.fixturePath))throw new Error(`duplicate fixture path: ${slice.fixturePath}`);
   if(typeof slice.load!=="function")throw new Error(`descriptor ${slice.id} load must be a function`);
   if(typeof slice.validate!=="function")throw new Error(`descriptor ${slice.id} validate must be a function`);
   if(typeof slice.successLabel!=="string"||slice.successLabel.trim()!==slice.successLabel||!slice.successLabel)throw new Error(`descriptor ${slice.id} successLabel must be a nonempty trimmed string`);
   ids.add(slice.id);paths.add(slice.fixturePath);slices.push(slice);
  }
 }
 return Object.freeze(slices);
}

export function validateAdditionalParitySlices(root,slices=additionalParitySlices){
 const issues=[];
 for(const slice of slices){
  let value;
  try{value=slice.load(root);}catch(error){issues.push(`${slice.id}: load failed: ${message(error)}`);continue;}
  try{
   const found=slice.validate(value);
   if(!Array.isArray(found)||!found.every(issue=>typeof issue==="string"))issues.push(`${slice.id}: validator must return string[]`);
   else issues.push(...found.map(issue=>`${slice.id}: ${issue}`));
  }catch(error){issues.push(`${slice.id}: validation failed: ${message(error)}`);}
 }
 return issues;
}

export const additionalParitySlices=composeAdditionalParitySlices(Object.freeze([
 Object.freeze({writer:"A",slices:writerAParitySlices}),
 Object.freeze({writer:"B",slices:writerBParitySlices})
]));
export const additionalParityFixturePaths=Object.freeze(additionalParitySlices.map(slice=>slice.fixturePath));
