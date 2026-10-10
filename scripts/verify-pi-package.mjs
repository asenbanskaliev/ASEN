import assert from "node:assert/strict";
import {mkdtempSync,realpathSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";
import {DefaultResourceLoader,SettingsManager} from "@earendil-works/pi-coding-agent";
import {createPiVerifierEnvironment} from "./gsp06-pi-free-environment.mjs";

// Run in a separate process: no credentials, models, user homes or ambient indexes.
if(!process.argv[2])throw new Error("Usage: node scripts/verify-pi-package.mjs <installed-package-root> [pi-cli-path]");
const packageRoot=path.resolve(process.argv[2]);
const root=mkdtempSync(path.join(tmpdir(),"asen-installed-pi-"));
try {
  process.env.HOME=root;process.env.USERPROFILE=root;
  process.env.PI_CODING_AGENT_DIR=path.join(root,"agent");
  process.env.ASEN_NO_SKILL_REGISTRY="1";
  delete process.env.ASEN_PI_AUTHORITY;
  const loader=new DefaultResourceLoader({cwd:root,agentDir:process.env.PI_CODING_AGENT_DIR,
    settingsManager:SettingsManager.inMemory({packages:[packageRoot]}),
    noSkills:true,noThemes:true,noPromptTemplates:true,noContextFiles:true,
    disabledBuiltinExtensions:["mcp","llama.cpp"]});
  await loader.reload();
  const loaded=loader.getExtensions();
  assert.deepEqual(loaded.errors,[]);
  assert.deepEqual(loaded.extensions.map(e=>path.basename(e.path)),["asen.ts"],"installed primary must exclude child authority");
  assert.equal(loaded.extensions.some(e=>e.handlers.has("tool_call")),false,"primary install must not inherit child tool denial");
  assert.ok(loaded.extensions[0].handlers.has("session_start"),"public preflight must wait for initialized host context");
  assert.equal(loaded.extensions[0].commands.size,0,"commands must not register before collision inventories are initialized");
  const defaultPiCli=path.join(path.dirname(fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent"))),"bundle","cli.js");
  const cli=process.argv[3]?path.resolve(process.argv[3]):defaultPiCli;
  const primary=path.join(packageRoot,"extensions","asen.ts"),probe=path.join(root,"public-host-probe.ts");
  writeFileSync(probe,`export default function(pi){
    pi.on("session_start",(_event,ctx)=>{
      const commands=pi.getCommands().map(row=>({name:row.name,source:row.source,path:row.sourceInfo.path}));
      const tools=pi.getAllTools().map(row=>({name:row.name,path:row.sourceInfo.path}));
      ctx.ui.notify("ASEN_PUBLIC_HOST:"+JSON.stringify({mode:ctx.mode,hasUI:ctx.hasUI,commands,tools}),"info");
    });
  }`);
  const child=spawn(process.execPath,[cli,"--mode","rpc","--no-session","--no-extensions","--extension",primary,"--extension",probe,"--no-skills"],{
    cwd:root,env:createPiVerifierEnvironment(process.env),stdio:["pipe","pipe","pipe"]});
  // Pi 0.85.1 decides whether to enter RPC from the first available stdin bytes.
  child.stdin.write(JSON.stringify({id:"commands",type:"get_commands"})+"\n");
  const closed=new Promise(resolve=>child.once("close",resolve));
  let models=0,visible=0;
  const hostObservations=[];
  try{
    await new Promise((resolve,reject)=>{
      const names=["asen","asen-commands","asen-status","asen-doctor","asen-agents","asen-changes","asen-profiles"];
      let buffer="",stdout="",stderr="",index=0,notifications=0;
      const timer=setTimeout(()=>fail(Error(`Installed RPC commands timed out: ${stderr.slice(-1000)}`)),20000);
      const fail=error=>{clearTimeout(timer);reject(error);};
      const send=value=>child.stdin.write(JSON.stringify(value)+"\n");
      const prompt=()=>send({id:names[index],type:"prompt",message:`/${names[index]}`});
      child.once("error",fail);
      child.once("close",(code,signal)=>{if(index!==names.length)fail(Error(`Installed RPC closed before completion (code=${code}, signal=${signal}): stdout=${stdout.slice(-2000)} stderr=${stderr.slice(-1000)}`));});
      child.stderr.on("data",chunk=>{stderr=(stderr+chunk.toString()).slice(-2000);});
      child.stdout.on("data",chunk=>{
        const text=chunk.toString();stdout=(stdout+text).slice(-4000);buffer+=text;if(buffer.length>100000){fail(Error("Oversized installed RPC output"));return;}
        let newline;while((newline=buffer.indexOf("\n"))>=0){
          const line=buffer.slice(0,newline);buffer=buffer.slice(newline+1);if(!line.trim())continue;
          try{
            const row=JSON.parse(line);
            if(row.type==="agent_start"){models++;throw Error("Installed command unexpectedly invoked a model");}
            if(row.type==="extension_ui_request"&&row.method==="notify"&&row.message.startsWith("ASEN_PUBLIC_HOST:")){
              hostObservations.push(JSON.parse(row.message.slice("ASEN_PUBLIC_HOST:".length)));
            }else if(row.type==="response"&&row.id==="commands"){
              assert.equal(row.success,true);
              for(const name of names)assert.ok(row.data.commands.some(c=>c.name===name));
              prompt();
            }else if(row.type==="extension_ui_request"&&row.method==="notify"){
              assert.equal(row.notifyType,"info");assert.ok(row.message.length>0);notifications++;
            }else if(row.type==="response"&&row.id===names[index]){
              assert.equal(row.success,true);assert.equal(notifications,1,`${names[index]} must be visible over RPC`);
              visible++;index++;notifications=0;
              if(index===names.length){clearTimeout(timer);resolve();}else prompt();
            }
          }catch(error){fail(error);}
        }
      });
    });
  }finally{child.kill();await closed;}
  assert.equal(models,0);assert.equal(visible,7);
  assert.equal(hostObservations.length,1,"public host inventories must be observed once after initialization");
  const host=hostObservations[0];
  assert.equal(host.mode,"rpc");assert.equal(typeof host.hasUI,"boolean");
  const fromPrimary=row=>realpathSync(row.path)===realpathSync(primary);
  for(const name of ["asen","asen-commands","asen-status","asen-doctor","asen-agents","asen-changes","asen-profiles"]){
    const matches=host.commands.filter(row=>row.name===name&&row.source==="extension"&&fromPrimary(row));
    assert.equal(matches.length,1,`${name} must have one canonical installed-source registration`);
  }
  const toolNames=["asen_ask_choice","asen_ask_question","asen_code_intelligence","codegraph"];
  for(const name of toolNames){
    const matches=host.tools.filter(row=>row.name===name&&realpathSync(row.path)===realpathSync(primary));
    assert.equal(matches.length,1,`${name} must have one canonical installed-source registration`);
  }
  console.log(JSON.stringify({installedPiPackageVerified:true,primaryExtensions:["asen.ts"],childAuthorityAutoLoaded:false,visibleRpcCommands:visible,modelInvocations:models,publicHost:{mode:host.mode,hasUI:host.hasUI,canonicalCommands:7,canonicalTools:4,toolsEnabled:true}}));
} finally {rmSync(root,{recursive:true,force:true});}
