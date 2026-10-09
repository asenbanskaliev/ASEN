import assert from "node:assert/strict";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";
import {DefaultResourceLoader,SettingsManager} from "@earendil-works/pi-coding-agent";

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
  for(const name of ["asen","asen-commands","asen-status","asen-review"])
    assert.ok(loaded.extensions[0].commands.has(name),`missing installed command: ${name}`);
  for(const name of ["asen","asen-commands","asen-status","asen-doctor","asen-agents","asen-changes","asen-profiles"]){
    const messages=[];
    const result=await loaded.extensions[0].commands.get(name).handler("",{ui:{notify:message=>messages.push(message)}});
    assert.equal(result,undefined,`${name} must honor the public Promise<void> contract`);
    assert.equal(messages.length,1,`${name} must publish one visible result`);
    assert.ok(messages[0].length>0,`${name} must publish nonempty output`);
  }
  const defaultPiCli=path.join(path.dirname(fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent"))),"bundle","cli.js");
  const cli=process.argv[3]?path.resolve(process.argv[3]):defaultPiCli;
  const child=spawn(process.execPath,[cli,"--mode","rpc","--no-session","--no-extensions","--extension",path.join(packageRoot,"extensions","asen.ts"),"--no-skills","--no-tools"],{
    cwd:root,env:{...process.env,PI_OFFLINE:"1",PI_TELEMETRY:"0",PI_SKIP_VERSION_CHECK:"1"},stdio:["pipe","pipe","pipe"]});
  const closed=new Promise(resolve=>child.once("close",resolve));
  let models=0,visible=0;
  try{
    await new Promise((resolve,reject)=>{
      const names=["asen","asen-commands","asen-status","asen-doctor","asen-agents","asen-changes","asen-profiles"];
      let buffer="",stderr="",index=0,notifications=0;
      const timer=setTimeout(()=>fail(Error(`Installed RPC commands timed out: ${stderr.slice(-1000)}`)),20000);
      const fail=error=>{clearTimeout(timer);reject(error);};
      const send=value=>child.stdin.write(JSON.stringify(value)+"\n");
      const prompt=()=>send({id:names[index],type:"prompt",message:`/${names[index]}`});
      child.once("error",fail);
      child.once("close",()=>{if(index!==names.length)fail(Error(`Installed RPC closed before completion: ${stderr.slice(-1000)}`));});
      child.stderr.on("data",chunk=>{stderr=(stderr+chunk.toString()).slice(-2000);});
      child.stdout.on("data",chunk=>{
        buffer+=chunk.toString();if(buffer.length>100000){fail(Error("Oversized installed RPC output"));return;}
        let newline;while((newline=buffer.indexOf("\n"))>=0){
          const line=buffer.slice(0,newline);buffer=buffer.slice(newline+1);if(!line.trim())continue;
          try{
            const row=JSON.parse(line);
            if(row.type==="agent_start"){models++;throw Error("Installed command unexpectedly invoked a model");}
            if(row.type==="response"&&row.id==="commands"){
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
      send({id:"commands",type:"get_commands"});
    });
  }finally{child.kill();await closed;}
  assert.equal(models,0);assert.equal(visible,7);
  console.log(JSON.stringify({installedPiPackageVerified:true,primaryExtensions:["asen.ts"],childAuthorityAutoLoaded:false,visibleRpcCommands:visible,modelInvocations:models}));
} finally {rmSync(root,{recursive:true,force:true});}
