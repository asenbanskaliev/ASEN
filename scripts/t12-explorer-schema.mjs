/** EF-203 bounded read-only Explorer output diagnostics.
 * A valid schema is not a verified provider result or authorization to write. */
const required=Object.freeze({
 currentState:"string",affectedAreas:"array",approaches:"array",evidence:"array",
 risks:"array",unknowns:"array",readiness:"string",findings:"array",
});
const exact=(value,keys)=>value!==null&&typeof value==="object"&&!Array.isArray(value)&&
 Object.getPrototypeOf(value)===Object.prototype&&
 Object.keys(value).sort().join("|")===keys.slice().sort().join("|");
const clean=(v,max)=>typeof v==="string"&&!!v.trim()&&v===v.trim()&&
 v.length<=max&&v===v.normalize("NFC")&&!/[\p{Cc}\p{Cf}\u2028\u2029]/u.test(v);
const pathValid=p=>clean(p,256)&&!p.startsWith("/")&&!p.includes("\\")&&!p.includes(":")&&
 p.split("/").every(part=>!!part&&part!=="."&&part!=="..");
function validValues(value){
 if(!exact(value,Object.keys(required))||!clean(value.currentState,1200)||
    !clean(value.readiness,400))return false;
 for(const name of ["affectedAreas","approaches","evidence","risks","unknowns"]){
  const list=value[name];
  if(!Array.isArray(list)||list.length>20||list.some(row=>!clean(row,600)))return false;
 }
 if(value.evidence.length===0)return false;
 if(!Array.isArray(value.findings)||value.findings.length>20)return false;
 const ids=new Set();
 for(const row of value.findings){
  if(!exact(row,["id","path","reason"])||!clean(row.id,120)||
     !/^[a-z0-9][a-z0-9._-]*$/u.test(row.id)||ids.has(row.id)||
     !pathValid(row.path)||!clean(row.reason,600))return false;
  ids.add(row.id);
 }
 return true;
}
export function inspectExplorerSchema(value){
 const observedShape=Object.fromEntries(Object.keys(required).map(key=>[
  key,Array.isArray(value?.[key])?"array":typeof value?.[key],
 ]));
 return Object.freeze({
  passed:Object.entries(required).every(([key,type])=>observedShape[key]===type)&&validValues(value),
  observedShape:Object.freeze(observedShape),
 });
}
