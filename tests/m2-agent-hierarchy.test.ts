import test from "node:test";
import assert from "node:assert/strict";
import {createNativeM2Navigator} from "../src/runtime/native-m2-navigator.js";
import {projectAgentHierarchy} from "../src/runtime/agents-panel.js";
import type {AgentInspection} from "../src/runtime/agent-inspect.js";
import type {PublicAgentRecord} from "../src/runtime/agent-lifecycle.js";
import {visibleWidth} from "../src/runtime/responsive-layout.js";

const sessionId="hierarchy-session",projectId="D:/opaque/project";
const rootId="agent-root-"+"r".repeat(96),childId="agent-child-"+"c".repeat(96);
const rootTime="2026-11-06T09:00:00.000Z",childTime="2026-11-06T08:00:00.000Z";
const record=(id:string,createdAt:string,state:PublicAgentRecord["state"]="running"):PublicAgentRecord=>({
 id,role:"explorer",owner:{kind:"user",id:"pi:"+sessionId},sessionId,projectId,state,createdAt,updatedAt:createdAt,
});
const inspection=(row:PublicAgentRecord):AgentInspection=>Object.freeze({
 record:row,history:Object.freeze([{id:row.id,revision:1,state:"queued" as const,at:row.createdAt}]),
});
const controls=()=>({requestRender(){},close(){},terminalRows(){return 24;},stillCurrent(){return true;}});
function hierarchySource(){
 const root=inspection(record(rootId,rootTime)),child=inspection(record(childId,childTime));
 const rows=projectAgentHierarchy({identity:{sessionId,projectId},records:[
  {id:child.record.id,role:child.record.role,owner:child.record.owner,sessionId,projectId,state:child.record.state,
   createdAt:child.record.createdAt,updatedAt:child.record.updatedAt,history:child.history,continuationOf:rootId},
  {id:root.record.id,role:root.record.role,owner:root.record.owner,sessionId,projectId,state:root.record.state,
   createdAt:root.record.createdAt,updatedAt:root.record.updatedAt,history:root.history},
 ],associations:[{taskId:"task-child",agentId:childId,sessionId,projectId}]});
 const byId=new Map([[rootId,root],[childId,child]]);
 return {kind:"agents" as const,agents:[child,root],hierarchy:rows.map(row=>Object.freeze({
  id:row.id,inspection:byId.get(row.id)!,hierarchy:row,
 }))};
}

test("M2 hierarchy orders proven Explorer continuations and keeps opaque selection bound to inspection",()=>{
 const source=hierarchySource(),calls:string[]=[];
 const view=createNativeM2Navigator(source,{...controls(),stop:async target=>{calls.push(target.id);return true;}});
 const list=view.render(140).join("\n");
 assert.ok(list.indexOf(rootId.slice(0,24))<list.indexOf(childId.slice(0,24)),"proven parent must render before its earlier-created continuation");
 assert.match(list,/continues/u);assert.match(list,/task task-child/u);
 view.handleInput("j");view.handleInput("\r");
 const detail=view.render(140).join("\n");
 assert.match(detail,new RegExp(`Task: ${childId.slice(0,40)}`,"u"));
 assert.match(detail,/Continuation of:/u);assert.match(detail,/Task audit: task-child/u);
 view.handleInput("s");
 assert.deepEqual(calls,[childId],"Stop must use the full inspection identity, never hierarchy labels or position-derived IDs");
 assert.ok(view.render(140).every(line=>visibleWidth(line)<=140));
});

test("M2 hierarchy fails closed on missing, duplicate or mismatched immutable bindings",()=>{
 const source=hierarchySource(),first=source.hierarchy[0]!;
 for(const hierarchy of [
  source.hierarchy.slice(1),
  [first,first],
  [Object.freeze({...first,id:"different-id"}),...source.hierarchy.slice(1)],
 ]){
  const candidate={...source,hierarchy};
  assert.throws(()=>createNativeM2Navigator(candidate,controls()),/hierarchy|binding/iu);
 }
});

test("M2 flat Agent source remains byte-for-byte legacy presentation when hierarchy metadata is absent",()=>{
 const child=inspection(record(childId,childTime)),root=inspection(record(rootId,rootTime));
 const view=createNativeM2Navigator({kind:"agents",agents:[child,root]},controls());
 const text=view.render(140).join("\n");
 assert.ok(text.indexOf(childId.slice(0,24))<text.indexOf(rootId.slice(0,24)));
 assert.doesNotMatch(text,/continues|Task audit|Continuation of:/u);
 assert.match(text,/j\/k: select · Enter: inspect · Tab: attention\/all · q: close/u);
});

test("M2 hierarchy refresh keeps the prior snapshot when replacement bindings are invalid",async()=>{
 const source=hierarchySource();let release!:(value:typeof source)=>void;
 const pending=new Promise<typeof source>(resolve=>{release=resolve;});
 const view=createNativeM2Navigator(source,{...controls(),refresh:()=>pending});
 const before=view.render(140);
 view.handleInput("r");
 release({...source,hierarchy:source.hierarchy.slice(1)});
 await new Promise<void>(resolve=>setImmediate(resolve));
 const after=view.render(140).join("\n");
 assert.match(after,/Refresh unavailable; snapshot retained/u);
 assert.match(after,new RegExp(rootId.slice(0,24),"u"));
 assert.equal(before.some(line=>line.includes(rootId.slice(0,24))),true);
});
