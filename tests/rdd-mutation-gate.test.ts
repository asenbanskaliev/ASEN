import assert from "node:assert/strict";
import test from "node:test";
import {buildOrchestrationPlan} from "../src/orchestration/orchestrator.js";
import {issueOddDecision} from "./helpers/odd-routing.js";
import {EvidenceStore} from "../src/evidence/store.js";
import {authorizeImplementation,verifySkillEvidence} from "../src/verify/verifier.js";
import {issueSkillContext} from "../src/skills/context.js";
import {selectSkills} from "../src/skills/registry.js";
const candidate={id:"d5",repository:"repo",revision:"a".repeat(40),createdAt:"ahora"};
test("D5 el gate de mutación exige intake aunque se seleccione apply",()=>{
 const context=issueSkillContext("d5","repo",candidate,{phase:"apply",defect:true}),store=new EvidenceStore();
 for(const kind of ["work-unit","scope","rollback"] as const)store.add(candidate,{id:kind,kind,status:"pass",summary:"acotada",createdAt:"ahora"});
 assert.ok(selectSkills(context).some(s=>s.id==="asen-defect-workflow"));
 assert.throws(()=>authorizeImplementation(candidate,context,store),/defect-intake/);
});
test("D5 deriva intención de defecto desde hechos ODD originales",()=>{
 const decision=issueOddDecision({taskId:"d5",repository:"repo",intent:"defect",paths:["src/a.ts"],writes:[{path:"src/a.ts",changeKind:"behavior"}]});
 const plan=buildOrchestrationPlan({taskId:"d5",repository:"repo",prompt:"corregir",candidate,codeChange:false,behaviorChange:false,filesTouched:0},decision);
 assert.equal(plan.decision.route,"direct");assert.ok(plan.skills.includes("asen-defect-workflow"));assert.ok(plan.skills.includes("asen-tdd"));assert.equal(plan.skillContext?.defect,true);assert.equal(Object.isFrozen(plan.skillContext),true);
});
test("D5 la fase defect explícita también exige intake para mutación",()=>{
 const context=issueSkillContext("d5","repo",candidate,{phase:"defect"}),store=new EvidenceStore();
 store.add(candidate,{id:"unidad",kind:"work-unit",status:"pass",summary:"acotada",createdAt:"ahora"});
 assert.equal(selectSkills(context).filter(s=>s.id==="asen-defect-workflow").length,1);
 assert.equal(verifySkillEvidence(candidate,selectSkills(context).map(s=>s.id),store,"mutation").ok,false);
});
test("D5 todos los contextos delegados conservan el defecto sin convertirlo en incidente",()=>{
 const decision=issueOddDecision({taskId:"d5-amplio",repository:"repo",intent:"defect",paths:["src/a.ts","src/b.ts"],writes:[{path:"src/a.ts",changeKind:"behavior"},{path:"src/b.ts",changeKind:"behavior"}]});
 const plan=buildOrchestrationPlan({taskId:"d5-amplio",repository:"repo",prompt:"corregir",candidate,writeSurfaces:["src/"]},decision);
 assert.equal(plan.decision.route,"orchestrate");
 for(const agent of plan.agents){assert.equal(agent.skillContext?.defect,true);assert.ok(agent.skillPaths?.includes("skills/asen-defect-workflow/SKILL.md"));}
 const ordinary=buildOrchestrationPlan({taskId:"ordinario",repository:"repo",prompt:"implementar",candidate},issueOddDecision({taskId:"ordinario",repository:"repo"}));
 assert.equal(ordinary.skills.includes("asen-defect-workflow"),false);
});
