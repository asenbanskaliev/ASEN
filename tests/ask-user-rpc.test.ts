import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {mkdtemp,writeFile,rm} from "node:fs/promises";
import {join,dirname,resolve} from "node:path";
import {tmpdir} from "node:os";
import {fileURLToPath,pathToFileURL} from "node:url";
import {createPiVerifierEnvironment} from "../scripts/gsp06-pi-free-environment.mjs";

test("real offline Pi RPC transports ASEN choice and cancellation without any model invocation",{timeout:20000},async t=>{
  const root=await mkdtemp(join(tmpdir(),"asen-interaction-rpc-"));
  const extension=join(root,"probe.ts"),source=pathToFileURL(resolve("extensions/asen.ts")).href;
  const credentialNames=["OPENROUTER_API_KEY","LLM7_API_KEY","GROQ_API_KEY","GITHUB_TOKEN","ASEN_TEST_UNRELATED_SECRET"];
  const ambient={...process.env,...Object.fromEntries(credentialNames.map(name=>[name,"ASEN-SYNTHETIC-CREDENTIAL"]))};
  await writeFile(extension,`import {createAsenExtension} from ${JSON.stringify(source)};
export default function(pi){const tools=new Map();createAsenExtension()({registerCommand:(...args)=>pi.registerCommand(...args),registerTool:tool=>{tools.set(tool.name,tool);pi.registerTool(tool);}});
pi.registerCommand("asen-interaction-probe",{description:"Synthetic offline interaction",handler:async(args,ctx)=>{
const params={question:"Synthetic choice",options:[{label:"A",description:"First",value:"a"},{label:"B",description:"Second",value:"b"}]};
const result=await tools.get("asen_ask_choice").execute("probe",params,undefined,undefined,ctx);
const credentialNames=${JSON.stringify(credentialNames)}.filter(name=>process.env[name]!==undefined);
ctx.ui.notify("ASEN_PROBE:"+JSON.stringify({...result.details,credentialNames}),"info");}});}
`);
  const main=fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent")),cli=join(dirname(main),"bundle","cli.js");
  const child=spawn(process.execPath,[cli,"--mode","rpc","--no-session","--no-extensions","--extension",extension,"--no-skills","--no-tools"],{
    cwd:root,env:createPiVerifierEnvironment({...ambient,PI_CODING_AGENT_DIR:join(root,"agent")}),stdio:["pipe","pipe","pipe"],
  });
  const closed=new Promise<void>(done=>child.once("close",()=>done()));
  t.after(async()=>{child.kill();await closed;await rm(root,{recursive:true,force:true});});
  const send=(message:unknown)=>child.stdin.write(JSON.stringify(message)+"\n");
  let buffer="",stderr="",dialogs=0,models=0;
  child.stderr.on("data",chunk=>{stderr+=chunk.toString();});
  const outcomes=await new Promise<any[]>((done,reject)=>{
    const timer=setTimeout(()=>reject(Error("RPC probe timed out: "+stderr.slice(-1000))),15000),results:any[]=[];
    child.once("error",reject);child.once("close",()=>{if(results.length!==2)reject(Error("Pi closed before probe: "+stderr.slice(-1000)));});
    child.stdout.on("data",chunk=>{
      buffer+=chunk.toString();if(buffer.length>100000){clearTimeout(timer);reject(Error("Oversized RPC output"));return;}
      let newline:number;while((newline=buffer.indexOf("\n"))>=0){
        const line=buffer.slice(0,newline);buffer=buffer.slice(newline+1);if(!line.trim())continue;
        try{
          const row=JSON.parse(line);if(row.type==="agent_start")models++;
          if(row.type==="response"&&row.id==="commands"){
            assert.equal(row.success,true);assert.ok(row.data.commands.some((c:any)=>c.name==="asen-interaction-probe"));
            send({id:"choose",type:"prompt",message:"/asen-interaction-probe"});
          }
          if(row.type==="extension_ui_request"&&row.method==="select"){
            dialogs++;send(dialogs===1?{type:"extension_ui_response",id:row.id,value:row.options[1]}:{type:"extension_ui_response",id:row.id,cancelled:true});
          }
          if(row.type==="extension_ui_request"&&row.method==="notify"&&row.message.startsWith("ASEN_PROBE:")){
            results.push(JSON.parse(row.message.slice("ASEN_PROBE:".length)));
            if(results.length===1)send({id:"cancel",type:"prompt",message:"/asen-interaction-probe"});
            else {clearTimeout(timer);done(results);}
          }
        }catch(error){clearTimeout(timer);reject(error);}
      }
    });
    send({id:"commands",type:"get_commands"});
  });
  assert.equal(dialogs,2);assert.equal(models,0,"extension commands must never fall through to model execution");
  for(const outcome of outcomes)assert.deepEqual(outcome.credentialNames,[],"the real Pi extension must receive no ambient credentials");
  assert.equal(outcomes[0].status,"answered");assert.equal(outcomes[0].selection.value,"b");assert.equal(outcomes[1].status,"cancelled");
});
