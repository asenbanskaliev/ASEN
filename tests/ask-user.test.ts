import test from "node:test";
import assert from "node:assert/strict";
import {createAsenExtension} from "../extensions/asen.js";

const choice={question:"Choose",options:[{label:"A",description:"First",value:"a"},{label:"B",description:"Second",value:"b"}]};
function tools(timeout=1000){const registered=new Map<string,any>();createAsenExtension({interactionTimeoutMs:timeout} as any)({registerCommand(){},registerTool(t:any){registered.set(t.name,t);}} as any);return registered;}
const call=(tool:any,params:any,ui:any,signal?:AbortSignal)=>tool.execute("call",params,signal,undefined,{hasUI:true,ui});

test("Pi registers both ASEN interaction tools; choice returns only the actual closed answer",async()=>{
  const registered=tools();assert.ok(registered.has("asen_ask_choice"));assert.ok(registered.has("asen_ask_question"));
  const result=await call(registered.get("asen_ask_choice"),choice,{select:async(_title:string,rows:string[])=>rows[1]});
  assert.equal(result.details.status,"answered");assert.equal(result.details.selection.value,"b");
  assert.equal("authority" in result.details,false);
});
test("invalid choices, forged host answers, unavailable UI and pre-cancel make no decision",async()=>{
  const tool=tools().get("asen_ask_choice");assert.ok(tool,"interaction tool must exist");let calls=0;
  const ui={select:async()=>{calls++;return "forged";}};
  for(const value of [{...choice,options:[choice.options[0]]},{...choice,options:[choice.options[0],choice.options[0]]},{...choice,authority:"approved"}])assert.equal((await call(tool,value,ui)).details.status,"invalid");
  assert.equal(calls,0);
  assert.equal((await call(tool,choice,ui)).details.status,"invalid_response");
  assert.equal((await tool.execute("x",choice,undefined,undefined,{hasUI:false,ui})).details.status,"unavailable");
  const c=new AbortController();c.abort();assert.equal((await call(tool,choice,ui,c.signal)).details.status,"cancelled");assert.equal(calls,1);
});
test("timeout aborts host dialog and late answers cannot complete a decision; failure permits retry",async()=>{
  const tool=tools(10).get("asen_ask_choice");assert.ok(tool);let observed:AbortSignal|undefined;
  const result=await call(tool,choice,{select:async(_t:any,_r:any,opts:any)=>{observed=opts.signal;return new Promise(()=>{});}});
  assert.equal(result.details.status,"timeout");assert.equal(observed?.aborted,true);
  const ui={select:async():Promise<string|undefined>=>{throw Error("private host failure");}};const failed=await call(tool,choice,ui);assert.equal(failed.details.status,"failed");assert.equal(JSON.stringify(failed).includes("private"),false);
  ui.select=async()=>undefined as any;assert.equal((await call(tool,choice,ui)).details.status,"cancelled");
});
test("questionnaire cancellation discards all partial answers; multiselect commits only on completion",async()=>{
  const tool=tools().get("asen_ask_question");assert.ok(tool);let step=0;
  const q={header:"Plan",question:"Choose",options:choice.options.map(({label,description})=>({label,description}))};
  const ui={select:async(_t:string,rows:string[])=>step++===0?rows[0]:undefined};
  const cancelled=await call(tool,{questions:[q,{...q,question:"Next"}]},ui);assert.equal(cancelled.details.status,"cancelled");assert.equal(cancelled.details.answers,undefined);
  step=0;const selected=await call(tool,{questions:[{...q,multiSelect:true}]},{select:async(_t:string,rows:string[])=>rows[step++===0?0:rows.length-1]});
  assert.equal(selected.details.status,"answered");assert.deepEqual(selected.details.answers[0].selected,["A"]);
});

test("cancellation before scheduled host call executes zero dialogs",async()=>{
  const tool=tools().get("asen_ask_choice"),controller=new AbortController();let calls=0;
  const pending=call(tool,choice,{select:async()=>{calls++;return undefined;}},controller.signal);controller.abort();
  assert.equal((await pending).details.status,"cancelled");assert.equal(calls,0);
});
test("timed-out host that ignores abort stays quarantined until its dialog settles",async()=>{
  const tool=tools(10).get("asen_ask_choice");let settle!:(value:string|undefined)=>void,calls=0;
  const ui={select:async()=>{calls++;return new Promise<string|undefined>(resolve=>{settle=resolve;});}};
  assert.equal((await call(tool,choice,ui)).details.status,"timeout");
  assert.equal((await call(tool,choice,ui)).details.status,"busy");assert.equal(calls,1);
  settle(undefined);await new Promise(resolve=>setImmediate(resolve));
  ui.select=async()=>undefined;assert.equal((await call(tool,choice,ui)).details.status,"cancelled");
});

test("malicious parameters never invoke getters, proxies or any dialog",async()=>{
  const tool=tools().get("asen_ask_choice");let effects=0;const ui={select:async()=>{effects++;return undefined;}};
  const getter=Object.defineProperty({...choice},"question",{get(){effects++;return "Choose";},enumerable:true});
  const proxy=new Proxy(choice,{get(){effects++;return "Choose";}});
  const sparse={...choice,options:Array(2)};
  for(const params of [getter,proxy,sparse,{...choice,question:"\x1b[31m"}])assert.equal((await call(tool,params,ui)).details.status,"invalid");
  assert.equal(effects,0);
});
test("custom text remains bounded data; native dialog descriptions and previews are preserved",async()=>{
  const tool=tools().get("asen_ask_question");let label="";
  const params={questions:[{header:"Plan",question:"Choose",options:[{label:"A",description:"First",preview:"Preview"},{label:"B",description:"Second"}]}]};
  const result=await call(tool,params,{select:async(_t:string,rows:string[])=>{label=rows[0]!;return "Other";},input:async()=>"custom answer"});
  assert.match(label,/First\nPreview/);assert.equal(result.details.answers[0].kind,"custom");assert.equal(result.details.answers[0].answer,"custom answer");
  assert.equal((await call(tool,params,{select:async()=>"Other",input:async()=>" ".repeat(3)})).details.status,"failed");
  assert.equal((await call(tool,params,{select:async()=>"Other",input:async()=>"\x1b[31m forged"})).details.status,"failed");
});
