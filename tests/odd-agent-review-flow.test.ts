import test from "node:test";
import assert from "node:assert/strict";
import {resolve} from "node:path";
import {tmpdir} from "node:os";
import {projectOddReviewHandoff,proposeJudgmentFixHandoff,type ScopedOddTodo} from "../src/review/odd-agent-review-flow.js";
import {renderAsenPanelSection,type AsenPanelSnapshot} from "../src/runtime/ui/ide-panel.js";

const projectId=resolve(tmpdir(),"asen-odd-review-test");
const sessionId="pi-source";
const head="a".repeat(40);
const taskId="todo-11111111-2222-4333-8444-555555555555";
const identity={sessionId,projectId};
const scopes=["src/a.ts"] as const;
const lenses=["risk","resilience","reliability","readability"] as const;
const profiles=lenses.map(lens=>({lens,choice:{model:"nvidia/free-reviewer"}}));
function todo():ScopedOddTodo{
 return {
  taskId,title:"Change module",requestId:"asen-plan:task-1:worker",
  plan:{role:"worker",skillPaths:[],candidate:{
   id:"task-1",repository:projectId,revision:head,
   createdAt:"2026-11-15T00:00:00.000Z"
  },writeSurfaces:[...scopes],writerAuthorizationBasis:"{\"scope\":\"known\"}",
  model:"nvidia/worker"},
  events:[{taskId,sessionId,projectId,state:"planned",revision:1,at:"2026-11-15T00:00:00.000Z"}],
  current:{taskId,sessionId,projectId,state:"succeeded",revision:2,at:"2026-11-15T01:00:00.000Z"}
 };
}
test("T04/T05 ODD Todo vincula candidato y perfil sin ejecutar modelo ni Writer",()=>{
 const result=projectOddReviewHandoff({identity,todo:todo(),currentHead:head,profiles});
 assert.equal(result.status,"review-setup-required");
 assert.deepEqual(result.blockers,[]);
 assert.deepEqual(result.writeSurfaces,scopes);
 assert.equal(result.workerModelRequested,"nvidia/worker");
 assert.equal(result.reviewerProfiles.length,4);
 assert.ok(result.reviewerProfiles.every(row=>row.model==="nvidia/free-reviewer"&&row.actual==="unknown"));
 assert.equal(result.reviewerModelActual,"unknown");
 assert.equal(result.nextCommand,"/asen-review todo "+taskId+" adaptive");
 assert.equal(result.requiresNewConsent,true);
 assert.equal(result.writerAuthority,false);
 assert.equal(result.accepted,false);
});
test("T04 identity, drift, scope and state never upgrade an unsafe ODD handoff",()=>{
 const source=todo();
 const trials=[
  {...source,current:{...source.current,sessionId:"otro"}},
  {...source,current:{...source.current,state:"planned" as const}},
  {...source,plan:{...source.plan!,candidate:{...source.plan!.candidate!,revision:"b".repeat(40)}}},
  {...source,plan:{...source.plan!,writeSurfaces:[".env"]}},
  {...source,plan:{...source.plan!,writeSurfaces:["../escape.ts"]}},
  {...source,plan:{...source.plan!,writerAuthorizationBasis:""}}
 ];
 for(const task of trials){
  const result=projectOddReviewHandoff({identity,todo:task,currentHead:head,profiles});
  assert.equal(result.status,"blocked");
  assert.ok(result.blockers.length>0);
  assert.equal(result.writerAuthority,false);
 }
});
test("T05 plan model cannot be misrepresented as the actual model",()=>{
 const result=projectOddReviewHandoff({identity,todo:todo(),currentHead:head,
  profiles:lenses.map(lens=>({lens,choice:{}}))});
 assert.ok(result.reviewerProfiles.every(route=>route.model==="unknown"));
 assert.equal(result.reviewerModelActual,"unknown");
 assert.throws(()=>projectOddReviewHandoff({identity,todo:todo(),currentHead:head,
  profiles:profiles.slice(0,3)}),/Invalid ODD/u);
});
test("T07 panel projects a real ODD review command without approving it",()=>{
 const snapshot:AsenPanelSnapshot={
  todos:[todo()],todosObserved:true,agents:[],jobs:[]
 };
 const todos=renderAsenPanelSection(snapshot,"TODOS").join("\n");
 const review=renderAsenPanelSection(snapshot,"REVIEW").join("\n");
 assert.match(todos,/\/asen-review todo todo-11111111/u);
 assert.match(review,/ODD Workers awaiting inspection/u);
 assert.match(review,/actual model unknown/u);
 assert.match(review,/fresh Writer consent/u);
});
test("T08 forged or decontextualized Judgment Day data cannot schedule Fix",()=>{
 const fake={
  status:"findings-require-review",requestId:"x",sessionId,
  candidateTreeIdentity:"tree",candidateRevision:head,
  judges:[],findings:[],acceptance:"not-accepted",
  deliveryAuthority:false,autoMerge:false,fixAgent:"not-launched"
 };
 assert.throws(()=>proposeJudgmentFixHandoff({
  report:fake as never,evidence:{} as never,
 }),/genuine issued/u);
});

test("T04 bloquea un Todo cuyo identificador no coincide con su estado persistido",()=>{
 const source=todo();
 const result=projectOddReviewHandoff({identity,todo:{
  ...source,current:{...source.current,taskId:"todo-otro"}
 },currentHead:head,profiles});
 assert.equal(result.status,"blocked");
 assert.ok(result.blockers.some(value=>value.includes("identity")));
 assert.equal(result.writerAuthority,false);
 assert.equal(result.accepted,false);
});
test("T05 no anuncia perfiles con modelo inválido o esfuerzo no reconocido",()=>{
 const changes=[
  {model:"nvidia//modelo"},
  {model:"nvidia/default"},
  {model:"modelo-sin-proveedor"},
  {thinking:"extreme"}
 ];
 for(const choice of changes){
  assert.throws(()=>projectOddReviewHandoff({
   identity,todo:todo(),currentHead:head,
   profiles:[...profiles.slice(0,3),{lens:profiles[3]!.lens,choice}]
  }),/Invalid ODD review handoff/u,JSON.stringify(choice));
 }
 const valid=projectOddReviewHandoff({
  identity,todo:todo(),currentHead:head,
  profiles:profiles.map(row=>({lens:row.lens,choice:{model:"nvidia/revisor",thinking:"minimal"}}))
 });
 assert.equal(valid.status,"review-setup-required");
 assert.ok(valid.reviewerProfiles.every(x=>x.thinking==="minimal"));
 assert.ok(valid.reviewerProfiles.every(x=>x.actual==="unknown"));
});
