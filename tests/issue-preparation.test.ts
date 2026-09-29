import assert from "node:assert/strict";
import test from "node:test";
import {evaluateDuplicateSearch,materializeIssue,selectIssueForm,type IssueForm,type DuplicateSearchInput} from "../src/issues/issue-preparation.js";

const form:IssueForm={id:"bug",titlePrefix:"[Bug] ",titleTemplate:"{{summary}}",labels:["type:bug","triage"],controls:[
 {type:"markdown",body:"Please provide exact evidence."},{type:"input",id:"summary",label:"Summary",required:true},{type:"textarea",id:"logs",label:"Logs",render:"shell",required:true},
 {type:"dropdown",id:"system",label:"System",options:["🪟 Windows","🐧 Linux"],required:true},{type:"dropdown",id:"versions",label:"Versions",options:["Current","Previous"],multiple:true},
 {type:"checkboxes",id:"checks",label:"Checks",options:[{id:"searched",label:"I searched existing issues",required:true,firstPerson:false},{id:"extra",label:"Extra context supplied"}]},
]};
const answers={summary:"Crashes on start",logs:"exit 1",system:"🐧 Linux",versions:["Previous","Current"],checks:{searched:true,extra:false}};
const sha=`sha256:${"a".repeat(64)}`,issueUrl="https://github.example/acme/app/issues/1";
const duplicate=(overrides:Partial<DuplicateSearchInput>={}):DuplicateSearchInput=>({repository:"github.example/acme/app",query:"crash",candidateIdentity:sha,current:true,coversOpen:true,coversClosed:true,complete:true,truncated:false,saturated:false,results:[{issue:issueUrl,repository:"github.example/acme/app",query:"crash",candidateIdentity:sha,classification:"not_duplicate"}],...overrides});
const unchangedFailure=(operation:()=>unknown,...inputs:unknown[])=>{const before=structuredClone(inputs);assert.throws(operation);assert.deepEqual(inputs,before);};

test("selects, copies, freezes, and preserves exact declared order",()=>{
 const selected=selectIssueForm([form]);assert.deepEqual(selected,form);assert.notEqual(selected,form);assert.ok(Object.isFrozen(selected.controls));
 assert.deepEqual((selected.controls[4] as {options:readonly string[]}).options,["Current","Previous"]);const other={...form,id:"feature",titlePrefix:"[Feature] "};assert.equal(selectIssueForm([form,other],"feature").id,"feature");
 for(const operation of [()=>selectIssueForm([]),()=>selectIssueForm([form,other]),()=>selectIssueForm([form,form],"bug"),()=>selectIssueForm([form,other],"BUG")])assert.throws(operation);
});

test("requires exact plain schemas at every form and control level",()=>{
 const mutations:unknown[]=[{...form,extra:true},{...form,controls:[{type:"markdown",body:"x",extra:true}]},{...form,controls:[{type:"input",id:"x",label:"X",options:[]}]},{...form,controls:[{type:"textarea",id:"x",label:"X",render:"bad language!"}]},{...form,controls:[{type:"dropdown",id:"x",label:"X",options:["A","a"]}]},{...form,controls:[{type:"checkboxes",id:"x",label:"X",options:[{id:"a",label:"A",extra:true}]}]}];
 for(const mutation of mutations)unchangedFailure(()=>selectIssueForm([mutation]),mutation);
 const inherited=Object.assign(Object.create({extra:true}),form);assert.throws(()=>selectIssueForm([inherited]));
 const accessor={...form};Object.defineProperty(accessor,"id",{enumerable:true,get:()=>"bug"});assert.throws(()=>selectIssueForm([accessor]));
});

test("rejects unsafe titles and non-unique or untrimmed labels",()=>{
 for(const changed of [{titlePrefix:"bad\n"},{titlePrefix:"bad\u2028"},{titlePrefix:"bad\u2029"},{titlePrefix:"{"},{titleTemplate:"{{summary"},{titleTemplate:"{{summary}}\u2028next"},{titleTemplate:"{{summary}}\u2029next"},{titleTemplate:"{{{{summary}}}}"},{titleTemplate:"{{summary}}}"},{labels:["Bug","bug"]},{labels:[" bug"]},{controls:[{type:"input",id:"a",label:"Same"},{type:"input",id:"b",label:"same"}]}])assert.throws(()=>selectIssueForm([{...form,...changed}]));
});

test("renders deterministic immutable NFC content with an injection-safe fence",()=>{
 const injected={...answers,logs:"é ``` close ```` also"},decomposed={...answers,logs:"e\u0301 ``` close ```` also"},before=structuredClone([form,injected]);const issue=materializeIssue(form,injected,{redactions:[]}),equivalent=materializeIssue(form,decomposed,{redactions:[]});
 assert.match(issue.body,/`````shell\né ``` close ```` also\n`````/);assert.equal(issue.candidateIdentity,equivalent.candidateIdentity);assert.match(issue.candidateIdentity,/^sha256:[a-f0-9]{64}$/);assert.ok(Object.isFrozen(issue)&&Object.isFrozen(issue.labels));assert.deepEqual([form,injected],before);
});

test("enforces single and multi dropdown exact semantics while preserving order",()=>{
 assert.match(materializeIssue(form,answers,{redactions:[]}).body,/### System\n- 🐧 Linux[\s\S]*### Versions\n- Previous\n- Current/);
 for(const invalid of [{...answers,system:["🐧 Linux"]},{...answers,system:"linux"},{...answers,system:""},{...answers,versions:["Current","Current"]},{...answers,versions:["current"]}])assert.throws(()=>materializeIssue(form,invalid as never,{redactions:[]}));
 assert.doesNotThrow(()=>materializeIssue(form,{...answers,versions:[]},{redactions:[]}));
 const required={...form,controls:form.controls.map(control=>control.type==="dropdown"&&control.id==="versions"?{...control,required:true}:control)};assert.throws(()=>materializeIssue(required,{...answers,versions:[]},{redactions:[]}));
});

test("derives first-person checkbox truth despite explicit false and rendered-prefix formatting",()=>{
 for(const label of ["I agree","I'm ready","I've reviewed","I'll follow up","I'd like this","i consent","**I** agree","_I'm_ ready","`I've` reviewed","✅ I'll follow up","\u200b\u200d**I'd** like this"]) {const changed={...form,controls:form.controls.map(control=>control.type==="checkboxes"?{...control,options:[{id:"voice",label,firstPerson:false}]}:control)};assert.throws(()=>materializeIssue(changed,{...answers,checks:{voice:false}},{redactions:[]}),/first-person/);}
 const thirdPerson={...form,controls:form.controls.map(control=>control.type==="checkboxes"?{...control,options:[{id:"voice",label:"✅ Confirm I agree",firstPerson:false}]}:control)};assert.doesNotThrow(()=>materializeIssue(thirdPerson,{...answers,checks:{voice:false}},{redactions:[]}));
});

test("rejects exact-answer violations and preserves failed inputs",()=>{
 const cases=[{...answers,unknown:"x"},{...answers,summary:"  "},{...answers,checks:{searched:true}},{...answers,checks:{searched:true,extra:false,unknown:false}}];for(const invalid of cases)unchangedFailure(()=>materializeIssue(form,invalid as never,{redactions:[]}),form,invalid);
 const inherited=Object.assign(Object.create({unknown:true}),answers);unchangedFailure(()=>materializeIssue(form,inherited,{redactions:[]}),form,inherited);
});

test("accepts only non-overlapping, order-independent exact reviewed redactions",()=>{
 const secret="ghp_abcdefghijklmnopqrstuvwxyz123456",input={...answers,logs:`prefix ${secret} suffix`},policy={redactions:[{before:secret,after:"[REDACTED]",reviewed:true as const}]};const result=materializeIssue(form,input,policy);assert.match(result.body,/\[REDACTED\]/);assert.doesNotMatch(result.body,/ghp_/);
 const invalid=[{redactions:[{before:secret,after:secret,reviewed:true}]},{redactions:[{before:secret,after:`safe ${secret}`,reviewed:true}]},{redactions:[{before:secret,after:"safe",reviewed:true},{before:secret.slice(0,12),after:"other",reviewed:true}]},{redactions:[{before:secret,after:"other-secret",reviewed:true},{before:"other-secret",after:"safe",reviewed:true}]},{redactions:[{before:"missing",after:"safe",reviewed:true}]},{redactions:[{before:secret,after:"safe",reviewed:true,extra:true}]},{redactions:[],extra:true}];
 for(const privacy of invalid)unchangedFailure(()=>materializeIssue(form,input,privacy as never),form,input,privacy);
});

test("normalizes redactions before hashing and rejects synthetic cross-field occurrence",()=>{
 const input={...answers,logs:"café secret"},decomposed={redactions:[{before:"cafe\u0301 secret",after:"safe cafe\u0301",reviewed:true as const}]},composed={redactions:[{before:"café secret",after:"safe café",reviewed:true as const}]},before=structuredClone([form,input,decomposed,composed]);const first=materializeIssue(form,input,decomposed),second=materializeIssue(form,input,composed);
 assert.equal(first.body,second.body);assert.equal(first.body,first.body.normalize("NFC"));assert.equal(first.candidateIdentity,second.candidateIdentity);assert.deepEqual([form,input,decomposed,composed],before);
 const crossField={redactions:[{before:"Crashes on start\u0000Please provide exact evidence.",after:"safe",reviewed:true as const}]};unchangedFailure(()=>materializeIssue(form,answers,crossField),form,answers,crossField);
});

test("redacts and revalidates labels in exact declared order",()=>{
 const secret="github_pat_abcdefghijklmnopqrstuvwxyz",labeled={...form,labels:["triage",secret,"type:bug"]},policy={redactions:[{before:secret,after:"privacy-reviewed",reviewed:true as const}]};assert.deepEqual(materializeIssue(labeled,answers,policy).labels,["triage","privacy-reviewed","type:bug"]);
 const invalid=[{form:{...form,labels:[secret]},privacy:{redactions:[]}},{form:{...form,labels:["private","public"]},privacy:{redactions:[{before:"private",after:"public",reviewed:true}]}},{form:{...form,labels:["private-label"]},privacy:{redactions:[{before:"private",after:" safe",reviewed:true}]}},{form:{...form,labels:["private-label"]},privacy:{redactions:[{before:"private",after:"safe\n",reviewed:true}]}}];
 for(const item of invalid)unchangedFailure(()=>materializeIssue(item.form,answers,item.privacy as never),item.form,answers,item.privacy);
 assert.throws(()=>materializeIssue({...form,labels:[secret]},answers,{redactions:[]}),error=>error instanceof Error&&error.message==="Materialized issue contains unresolved sensitive material"&&!error.message.includes(secret));
});

test("revalidates the substituted and redacted final title as one safe line",()=>{
 for(const summary of ["first\nsecond","first\u0000second","first\u007fsecond","first\u2028second","first\u2029second"])assert.throws(()=>materializeIssue(form,{...answers,summary},{redactions:[]}),/Materialized issue title is malformed/);
 const changed={...form,titlePrefix:"private ",titleTemplate:"{{summary}}"};for(const after of ["safe\n","safe\u2028","safe\u2029"])assert.throws(()=>materializeIssue(changed,answers,{redactions:[{before:"private",after,reviewed:true}]}),/Materialized issue title is malformed/);
});

test("detects expanded sensitive families without disclosing material",()=>{
 const values=["δοκιμή@παράδειγμα.δοκιμή","sk-abcdefgh12345678","github_pat_abcdefghijklmnopqrstuvwxyz","eyJabc.def.ghi","AKIAABCDEFGHIJKLMNOP","Bearer abcdefghijkl","api_key=abcdefghijk","~/.ssh/id_ed25519","/root/.config/token","/home/alice/file","/Users/alice/file","$HOME/.ssh","${HOME}/.ssh","%USERPROFILE%\\file","C:\\Users\\alice\\file"];
 for(const value of values)assert.throws(()=>materializeIssue(form,{...answers,logs:value},{redactions:[]}),error=>error instanceof Error&&/sensitive/.test(error.message)&&!error.message.includes(value));
});

test("validates all duplicate evidence before selecting the decision",()=>{
 const input=duplicate(),before=structuredClone(input);assert.deepEqual(evaluateDuplicateSearch(input),{status:"proceed",reason:"all_not_duplicate",duplicateIssue:null});assert.deepEqual(input,before);
 const second={...input.results[0]!,issue:"https://github.example/acme/app/issues/2",classification:"duplicate" as const},one={...input.results[0]!,classification:"duplicate" as const};assert.deepEqual(evaluateDuplicateSearch(duplicate({results:[one,second]})),{status:"block",reason:"uncertain",duplicateIssue:null});assert.deepEqual(evaluateDuplicateSearch(duplicate({results:[one]})),{status:"block",reason:"duplicate",duplicateIssue:issueUrl});
 const malformedAfter={...second,issue:"bad"};assert.deepEqual(evaluateDuplicateSearch(duplicate({results:[one,malformedAfter]})),{status:"block",reason:"uncertain",duplicateIssue:null});
});

test("canonicalizes duplicate issue URL identity before decisions",()=>{
 const explicit=duplicate({results:[{...duplicate().results[0]!,issue:"https://GITHUB.EXAMPLE/Acme/App/issues/1",classification:"duplicate"}]});assert.deepEqual(evaluateDuplicateSearch(explicit),{status:"block",reason:"duplicate",duplicateIssue:"https://github.example/acme/app/issues/1"});
 const shorthand=duplicate({repository:"acme/app",results:[{...duplicate().results[0]!,repository:"acme/app",issue:"https://github.com/acme/app/issues/1",classification:"duplicate"}]});assert.deepEqual(evaluateDuplicateSearch(shorthand),{status:"block",reason:"duplicate",duplicateIssue:"https://github.com/acme/app/issues/1"});
 const equivalent=[{...duplicate().results[0]!,issue:"https://GITHUB.EXAMPLE/acme/app/issues/1"},{...duplicate().results[0]!,issue:"https://github.example/acme/other/../app/issues/1"}];assert.deepEqual(evaluateDuplicateSearch(duplicate({results:equivalent})),{status:"block",reason:"uncertain",duplicateIssue:null});
 for(const issue of ["https://other.example/acme/app/issues/2","https://github.example/other/app/issues/2","https://github.example/acme/other/issues/2"]){const input=duplicate({results:[duplicate().results[0]!,{...duplicate().results[0]!,issue,classification:"duplicate"}]});const before=structuredClone(input);assert.deepEqual(evaluateDuplicateSearch(input),{status:"block",reason:"uncertain",duplicateIssue:null});assert.deepEqual(input,before);}
});

test("fails closed for malformed, incomplete, duplicate, or non-plain search evidence without mutation",()=>{
 const base=duplicate(),result=base.results[0]!;const changes:Partial<DuplicateSearchInput>[]=[{repository:" acme/app"},{repository:"owner"},{query:" "},{candidateIdentity:`sha256:${"A".repeat(64)}`},{coversOpen:false},{coversClosed:false},{complete:false},{truncated:true},{saturated:true},{current:false},{results:[{...result,classification:undefined} as never]},{results:[result,{...result}]},{results:[{...result,extra:true} as never]},{results:[{...result,issue:"http://github.example/acme/app/issues/1"}]}];
 for(const changed of changes){const input=duplicate(changed),before=structuredClone(input);assert.deepEqual(evaluateDuplicateSearch(input),{status:"block",reason:"uncertain",duplicateIssue:null});assert.deepEqual(input,before);}const extra={...base,extra:true};assert.deepEqual(evaluateDuplicateSearch(extra as never),{status:"block",reason:"uncertain",duplicateIssue:null});const inherited=Object.assign(Object.create({extra:true}),base);assert.deepEqual(evaluateDuplicateSearch(inherited),{status:"block",reason:"uncertain",duplicateIssue:null});
});
