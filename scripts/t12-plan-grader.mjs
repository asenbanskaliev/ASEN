import assert from "node:assert/strict";
const allowed=Object.freeze({pricing:"src/pricing.js",authorization:"src/access.js",parsing:"src/parse.js"});
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
export function gradePlan(plan,{candidateSha}={}){
 assert.ok(plan && typeof plan==="object" && !Array.isArray(plan),"Plan must be an object");
 assert.ok(typeof candidateSha==="string" && /^[a-f0-9]{40}$/.test(candidateSha),"Exact candidate SHA required");
 assert.equal(plan.candidateSha,candidateSha,"Plan candidate SHA mismatch");
 assert.equal(plan.scope,"disposable-fixture","Plan scope mismatch");
 assert.ok(Array.isArray(plan.tasks) && plan.tasks.length===3,"Plan must contain exactly three scoped tasks");
 const tasks=new Map(),findings=new Set();
 for(const task of plan.tasks){
  assert.ok(task && typeof task==="object" && !Array.isArray(task),"Invalid task");
  assert.ok(typeof task.id==="string" && /^[a-z0-9-]{1,48}$/.test(task.id) && !tasks.has(task.id),"Invalid/duplicate task id");
  assert.ok(typeof task.findingId==="string" && own(allowed,task.findingId) && !findings.has(task.findingId),"Unknown/duplicate finding");
  assert.deepEqual(task.paths,[allowed[task.findingId]],"Out-of-scope path");
  assert.ok(Array.isArray(task.dependsOn) && task.dependsOn.every(x=>typeof x==="string"),"Invalid dependencies");
  assert.ok(typeof task.change==="string" && task.change.trim().length>=20,"Concrete change required");
  assert.ok(typeof task.verification==="string" && task.verification.trim().length>=20,"Concrete verification required");
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
 return Object.freeze({passed:true,candidateSha,taskCount:tasks.size,findings:[...findings].sort(),authorization:"NOT_GRANTED"});
}
