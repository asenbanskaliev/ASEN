import test, {after} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import childProcess from "node:child_process";
import {syncBuiltinESMExports} from "node:module";
import {EventEmitter} from "node:events";
import path from "node:path";
import {runAsen} from "../src/cli.js";
import {parseAsenArgs} from "../src/runtime/launcher.js";

// The admitted runner supplies a fresh owned root; never fall back to user state.
const state=path.resolve(process.env.P05_STATE??"MISSING_P05_STATE");
assert.ok(state.startsWith(path.resolve(".cache/p05-home-selectors")+path.sep));
const fixtures=path.join(state,"fixtures");fs.mkdirSync(fixtures,{recursive:false});
const observations:unknown[]=[];let assertions=0;
function equal(actual:unknown,expected:unknown){assertions++;assert.deepEqual(actual,expected);}
function snapshot(root:string):unknown[]{return fs.readdirSync(root).sort().flatMap(name=>{
 const file=path.join(root,name),stat=fs.lstatSync(file);
 assert.ok(!stat.isSymbolicLink());
 return stat.isDirectory()?[[name,"directory",snapshot(file)]]:[[name,"file",fs.readFileSync(file).toString("hex")]];
});}
function fixture(config=true){
 const root=fs.mkdtempSync(path.join(fixtures,"case-")),home=path.join(root,"os-home");
 const dirs={home,linked:path.join(root,"linked"),isolated:path.join(root,"isolated"),configured:path.join(root,"configured"),explicit:path.join(root,"Datos ASEN 日本語"),pkg:path.join(root,"package")};
 for(const dir of Object.values(dirs)){fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,"sentinel"),"unchanged\n");}
 fs.mkdirSync(path.join(home,".asen"));
 if(config)fs.writeFileSync(path.join(home,".asen/config.json"),JSON.stringify({home:dirs.configured}));
 return {root,...dirs};
}
async function observe(label:string,argv:string[],f:ReturnType<typeof fixture>,env:Record<string,string|undefined>){
 const before=snapshot(f.root),launches:{command:unknown;args:unknown}[]=[];let homeCalls=0,configReads=0,stdout="",stderr="";
 const originalSpawn=childProcess.spawn,originalRead=fsPromises.readFile;
 // Update real ESM builtin bindings, so CLI's named imports are intercepted too.
 childProcess.spawn=((command:unknown,args:unknown)=>{launches.push({command,args});const child=new EventEmitter();queueMicrotask(()=>child.emit("exit",0));return child;}) as typeof childProcess.spawn;
 fsPromises.readFile=((file:unknown,...args:unknown[])=>{if(String(file)===path.join(f.home,".asen/config.json"))configReads++;return (originalRead as Function)(file,...args);}) as typeof fsPromises.readFile;
 syncBuiltinESMExports();
 let exit:number;
 try{exit=await runAsen(argv,env,{homeDirectory:()=>{homeCalls++;return f.home;},stdout:text=>{stdout+=text;},stderr:text=>{stderr+=text;}});}
 finally{childProcess.spawn=originalSpawn;fsPromises.readFile=originalRead;syncBuiltinESMExports();}
 const result={exit,stdout,stderr,homeCalls,configReads,launches};
 const unchanged=JSON.stringify(snapshot(f.root))===JSON.stringify(before);
 observations.push({label,argv,result,unchanged});
 equal(unchanged,true);return result;
}
function expectedHome(dir:string){return {exit:0,stdout:`${dir}\n`,stderr:"",homeCalls:1,configReads:1,launches:[]};}

for(const variant of ["config","environment","default"] as const)test(`S5 legacy plain home: ${variant}`,async()=>{
 const f=fixture(variant==="config"),env=variant==="default"?{}:{ASEN_HOME:f.isolated};
 const result=await observe(`plain-${variant}`,["home"],f,env);
 const selected={config:f.configured,environment:f.isolated,default:path.join(f.home,".asen/agent")};
 equal(result,expectedHome(selected[variant]));
});
for(const selector of ["path","equals","link-env","isolated-env","link-default","isolated-default"] as const)test(`S2 S3 S5 trailing selector: ${selector}`,async()=>{
 const f=fixture(),env=selector.endsWith("default")?{}:{ASEN_HOME:f.isolated,PI_CODING_AGENT_DIR:f.linked};
 let flags=[selector.startsWith("link")?"--link":"--isolated"];
 if(selector==="path")flags=["--home",f.explicit];
 if(selector==="equals")flags=[`--home=${f.explicit}`];
 const selections={path:f.explicit,equals:f.explicit,"link-env":f.linked,"isolated-env":f.isolated,"link-default":path.join(f.home,".pi/agent"),"isolated-default":path.join(f.home,".asen/agent")};
 const selected=selections[selector];
 const argv=["home",...flags],result=await observe(selector,argv,f,env);
 equal(result,expectedHome(selected));
 const parsed=parseAsenArgs(argv);equal({command:parsed.command,link:parsed.link,isolated:parsed.isolated,home:parsed.home,error:parsed.error},{command:"home",link:selector.startsWith("link"),isolated:selector.startsWith("isolated"),home:selector==="path"||selector==="equals"?f.explicit:undefined,error:undefined});
});
for(const pair of [["--link","--isolated"],["--link","--home"],["--isolated","--home"]])test(`S3 S5 conflict has no effects: ${pair.join(" + ")}`,async()=>{
 const f=fixture(),flags=pair.includes("--home")?[...pair,f.explicit]:pair;
 const result=await observe(pair.join("+"),["home",...flags],f,{ASEN_HOME:f.isolated,PI_CODING_AGENT_DIR:f.linked});
 equal(result,{exit:2,stdout:"",stderr:`${pair[0]} and ${pair[1]} are mutually exclusive\n`,homeCalls:0,configReads:0,launches:[]});
 equal(parseAsenArgs(["home",...flags]).error,`${pair[0]} and ${pair[1]} are mutually exclusive`);
});
// Leading home does not adopt unrelated command modes or cross the delimiter.
for(const tail of [["--help"],["--version"],["setup"],["--","--link","--isolated"]])test(`S4 home preserves ignored non-selector tail: ${JSON.stringify(tail)}`,async()=>{
 const f=fixture();equal(await observe(JSON.stringify(tail),["home",...tail],f,{}),expectedHome(f.configured));
 equal(parseAsenArgs(["home",...tail]),{link:false,isolated:false,help:false,version:false,command:"home",commandArgs:tail,passthrough:[]});
});
// Pin the old grammar; none of these literals may become a home query.
for(const input of [["--link","home"],["--","home","--isolated"],["--model","home"],["--model","--isolated","home"],["auth","home"]])test(`S4 public Pi passthrough: ${JSON.stringify(input)}`,async()=>{
 const f=fixture(),argv=["--package-root",f.pkg,...input];
 const result=await observe(JSON.stringify(input),argv,f,{ASEN_PI:path.join(f.root,"never-executed-runtime"),ASEN_HOME:f.isolated});
 let expected=input;
 if(input[0]==="--link")expected=["home"];
 if(input[0]==="--")expected=input.slice(1);
 equal(result,{exit:0,stdout:"",stderr:"",homeCalls:1,configReads:1,launches:[{command:path.join(f.root,"never-executed-runtime"),args:input[0]==="auth"?expected:["-e",f.pkg,...expected]}]});
});
test("S4 existing setup command does not become trailing-home grammar",async()=>{
 const f=fixture();equal(await observe("setup",["setup","home","--link"],f,{}),{exit:2,stdout:"",stderr:"Unsupported ASEN setup arguments.\n",homeCalls:0,configReads:0,launches:[]});
});
after(()=>fs.writeFileSync(path.join(state,"observations.json"),JSON.stringify({assertions,observations},null,2),{flag:"wx"}));
