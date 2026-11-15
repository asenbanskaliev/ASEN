import assert from "node:assert/strict";
const allowed=Object.freeze({pricing:"src/pricing.js",authorization:"src/access.js",parsing:"src/parse.js"});
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const exactKeys=(value,keys)=>value&&typeof value==="object"&&!Array.isArray(value)&&Object.keys(value).sort().join(",")===keys.slice().sort().join(",");
export function gradePlan(plan,{candidateId,candidateSha}={}){
 assert.ok(plan && typeof plan==="object" && !Array.isArray(plan),"Plan must be an object");
 assert.ok(typeof candidateId==="string"&&candidateId.length>0,"Exact candidate ID required");
 assert.ok(typeof candidateSha==="string" && /^[a-f0-9]{40}$/.test(candidateSha),"Exact candidate SHA required");
 assert.ok(exactKeys(plan,["candidateId","candidateSha","scope","tasks"]),"Plan fields do not match the required schema");
 assert.equal(plan.candidateId,candidateId,"Plan candidate ID mismatch");
 assert.equal(plan.candidateSha,candidateSha,"Plan candidate SHA mismatch");
 assert.equal(plan.scope,"disposable-fixture","Plan scope mismatch");
 assert.ok(Array.isArray(plan.tasks) && plan.tasks.length===3,"Plan must contain exactly three scoped tasks");
 const tasks=new Map(),findings=new Set();
 for(const task of plan.tasks){
  assert.ok(task && typeof task==="object" && !Array.isArray(task),"Invalid task");
  assert.ok(exactKeys(task,["id","findingId","paths","dependsOn","change","verification","risks","role"]),"Task fields do not match the required schema");
  assert.ok(typeof task.id==="string" && /^[a-z0-9-]{1,48}$/.test(task.id) && !tasks.has(task.id),"Invalid/duplicate task id");
  assert.ok(typeof task.findingId==="string" && own(allowed,task.findingId) && !findings.has(task.findingId),"Unknown/duplicate finding");
  assert.deepEqual(task.paths,[allowed[task.findingId]],"Out-of-scope path");
  assert.ok(Array.isArray(task.dependsOn) && task.dependsOn.every(x=>typeof x==="string"),"Invalid dependencies");
  assert.ok(typeof task.change==="string" && task.change.trim().length>=20,"Concrete change required");
  assert.ok(typeof task.verification==="string" && task.verification.trim().length>=20,"Concrete verification required");
  assert.ok(typeof task.risks==="string" && task.risks.trim().length>=20,"Concrete risk assessment required");
  assert.equal(task.role,"worker","Only a subsequently authorized worker may perform writes");
  tasks.set(task.id,task);findings.add(task.findingId);
 }
 for(const task of tasks.values()){
  const seen=new Set();
  for(const dep of task.dependsOn){assert.ok(tasks.has(dep)&&dep!==task.id&&!seen.has(dep),"Invalid dependency");seen.add(dep);}
 }
 const visiting=new Set(),visited=new Set();
 function walk(id){if(visiting.has(id))throw new Error("Cyclic plan");if(visited.has(id))return;visiting.add(id);for(const d of tasks.get(id).dependsOn)walk(d);visiting.delete(id);visited.add(id);}
 for(const id of tasks.keys())walk(id);
 const taskIndexes=new Map([...tasks.keys()].map((id,index)=>[id,index]));
 for(const [index,task] of [...tasks.values()].entries())for(const dependency of task.dependsOn)
  assert.ok(taskIndexes.get(dependency)<index,"Dependencies must refer to an earlier task");
 const normalizedTasks=[...tasks.values()].map(task=>Object.freeze({
  id:task.id,findingId:task.findingId,paths:[...task.paths],dependsOn:[...task.dependsOn].sort(),
  change:task.change.trim(),verification:task.verification.trim(),risks:task.risks.trim(),role:task.role,
 }));
 return Object.freeze({passed:true,candidateId,candidateSha,scope:"disposable-fixture",taskCount:tasks.size,tasks:Object.freeze(normalizedTasks),findings:Object.freeze([...findings].sort()),authorization:"NOT_GRANTED"});
}
