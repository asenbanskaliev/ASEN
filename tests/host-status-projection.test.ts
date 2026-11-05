import assert from "node:assert/strict";
import test from "node:test";
import {projectHostStatus,type HostStatusInput} from "../src/runtime/host-status-projection.js";
import {sanitizeTerminalText,truncateForTerminal,visibleWidth} from "../src/runtime/responsive-layout.js";

const unavailable={
 selectedModel:null,respondingModel:null,effectiveThinking:null,
 context:{percent:null,state:"unknown"},
 cost:"unavailable",subscription:"unavailable",quota:"unavailable",
};

test("missing public observations have exact unknown/unavailable output",()=>{
 assert.deepEqual(projectHostStatus(),unavailable);
});

test("selected provider/model are not evidence of the responding model",()=>{
 const host=Object.freeze({model:Object.freeze({provider:"selected-provider",id:"selected-model",name:"not identity"})});
 assert.deepEqual(projectHostStatus(host),{...unavailable,selectedModel:{provider:"selected-provider",model:"selected-model"}});
 assert.deepEqual(host,{model:{provider:"selected-provider",id:"selected-model",name:"not identity"}});
});

test("only explicit assistant responseModel metadata establishes responder identity",()=>{
 const host=Object.freeze({model:Object.freeze({provider:"route",id:"selected"})});
 const response=Object.freeze({role:"assistant",provider:"physical-provider",responseModel:"reported-model"});
 assert.deepEqual(projectHostStatus(host,response),{
  ...unavailable,selectedModel:{provider:"route",model:"selected"},
  respondingModel:{provider:"physical-provider",model:"reported-model"},
 });
 assert.deepEqual(response,{role:"assistant",provider:"physical-provider",responseModel:"reported-model"});
});

for(const response of [undefined,{role:"assistant",provider:"p",model:"requested"},
 {role:"toolResult",provider:"p",responseModel:"m"},{role:"assistant",responseModel:"m"},
 {role:"assistant",provider:"p",responseModel:17}]) {
 test("responder remains unknown without complete observed assistant response metadata: "+JSON.stringify(response),()=>{
  assert.deepEqual(projectHostStatus({},response),unavailable);
 });
}

for(const level of ["off","minimal","low","medium","high","xhigh","max"]) {
 test("effective thinking uses the supported public host value: "+level,()=>{
  assert.deepEqual(projectHostStatus({thinkingLevel:level}),{...unavailable,effectiveThinking:level});
 });
}
for(const level of [undefined,null,"auto","fast","HIGH",1,{level:"high"}]) {
 test("unsupported thinking is not inferred: "+JSON.stringify(level),()=>{
  assert.deepEqual(projectHostStatus({model:{reasoning:true},thinkingLevel:level}),unavailable);
 });
}

for(const [percent,state] of [[0,"normal"],[79.999,"normal"],[80,"warning"],[94.999,"warning"],[95,"error"],[100,"error"],[null,"unknown"]] as const) {
 test("context threshold uses unrounded percent: "+percent,()=>{
  const usage=Object.freeze({tokens:percent===null?null:100,contextWindow:1000,percent});
  const host=Object.freeze({getContextUsage:()=>usage});
  assert.deepEqual(projectHostStatus(host),{...unavailable,context:{percent,state}});
  assert.deepEqual(usage,{tokens:percent===null?null:100,contextWindow:1000,percent});
 });
}

test("post-compaction null replaces prior usage without stale percentage or zero",()=>{
 let usage:{tokens:number|null;contextWindow:number;percent:number|null}={tokens:950,contextWindow:1000,percent:95};
 const host={getContextUsage:()=>usage};
 const before=projectHostStatus(host);
 usage={tokens:null,contextWindow:1000,percent:null};
 assert.deepEqual(projectHostStatus(host),unavailable);
 assert.deepEqual(before.context,{percent:95,state:"error"});
 usage={tokens:100,contextWindow:1000,percent:10};
 assert.deepEqual(projectHostStatus(host).context,{percent:10,state:"normal"});
});

for(const usage of [undefined,null,17,"80",{},
 ...[undefined,null,"80",NaN,Infinity,-1,101].map(percent=>({tokens:10,contextWindow:100,percent})),
 {percent:80,tokens:null,contextWindow:100}]) {
 test("malformed/missing context is unknown: "+JSON.stringify(usage),()=>{
  assert.deepEqual(projectHostStatus({getContextUsage:()=>usage}),unavailable);
 });
}

for(const usage of [
 {percent:80},{percent:80,tokens:10},{percent:80,tokens:-1,contextWindow:100},
 {percent:80,tokens:NaN,contextWindow:100},{percent:80,tokens:"10",contextWindow:100},
 {percent:80,tokens:10,contextWindow:0},{percent:80,tokens:10,contextWindow:Infinity},
 {percent:80,tokens:10,contextWindow:"100"},
]) {
 test("incomplete or malformed usage metadata cannot establish a percentage: "+JSON.stringify(usage),()=>{
  assert.deepEqual(projectHostStatus({getContextUsage:()=>usage}),unavailable);
 });
}

test("throwing public accessors are isolated and never expose raw exceptions",()=>{
 const host={
  get model():never {throw new Error("private model failure");},
  get thinkingLevel():never {throw new Error("private thinking failure");},
  getContextUsage():never {throw new Error("private usage failure");},
 };
 assert.deepEqual(projectHostStatus(host),unavailable);
 assert.deepEqual(projectHostStatus({get getContextUsage():never {throw "private getter";}}),unavailable);
 assert.deepEqual(projectHostStatus({model:{get provider():never {throw "private property";},id:"m"}}),unavailable);
 assert.deepEqual(projectHostStatus({}, {get role():never {throw "private response";}}),unavailable);
});

test("one unavailable observation does not erase independent public facts; preserve receiver",()=>{
 const host={model:{provider:"p",id:"m"},thinkingLevel:"low",getContextUsage(){
  assert.equal(this,host);
  throw new Error("private");
 }};
 assert.deepEqual(projectHostStatus(host),{...unavailable,selectedModel:{provider:"p",model:"m"},effectiveThinking:"low"});
});

for(const model of [null,{},"model",{provider:"p"},{provider:"",id:"m"},{provider:"p",id:4}]) {
 test("malformed selected model yields unknown without coercion: "+JSON.stringify(model),()=>{
  assert.deepEqual(projectHostStatus({model}),unavailable);
 });
}

test("display strings reuse terminal sanitization and column limits",()=>{
 const provider="p\u001b\n\u202e"+"界".repeat(100);
 const model="m\t"+"界".repeat(100);
 const expected={provider:truncateForTerminal(sanitizeTerminalText(provider),55),model:truncateForTerminal(sanitizeTerminalText(model),55)};
 const result=projectHostStatus({model:{provider,id:model}},{role:"assistant",provider,responseModel:model});
 assert.deepEqual(result,{...unavailable,selectedModel:expected,respondingModel:expected});
 assert.ok(visibleWidth(result.selectedModel!.provider)<=55);
 assert.ok(visibleWidth(result.selectedModel!.model)<=55);
 assert.doesNotMatch(JSON.stringify(result),/\\u001b|\\n|\\t|\\u202e/u);
});

test("content, credentials, model prices and assistant-only usage are never inspected or summed",()=>{
 const forbidden=()=>{throw new Error("must not inspect private or incomplete accounting");};
 const model=Object.freeze({provider:"p",id:"m",get cost(){return forbidden();},get apiKey(){return forbidden();}});
 const host=Object.freeze({model,get sessionManager(){return forbidden();},get subscription(){return forbidden();},get quota(){return forbidden();}});
 const response=Object.freeze({role:"assistant",provider:"p",responseModel:"m",get content(){return forbidden();},get usage(){return forbidden();}});
 assert.deepEqual(projectHostStatus(host,response),{...unavailable,selectedModel:{provider:"p",model:"m"},respondingModel:{provider:"p",model:"m"}});
});

test("runtime-invalid public boundary values fail closed without coercion",()=>{
 for(const host of [null,42,"host",{getContextUsage:42}]) {
  assert.deepEqual(projectHostStatus(host as unknown as HostStatusInput),unavailable);
 }
});
