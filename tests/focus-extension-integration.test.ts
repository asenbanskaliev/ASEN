import assert from "node:assert/strict";
import test,{type TestContext} from "node:test";
import {mkdir,mkdtemp,readFile} from "node:fs/promises";
import path from "node:path";
import {Theme,VERSION,type ThemeToken,type ThemeBg} from "@earendil-works/pi-coding-agent";
import {visibleWidth} from "../src/runtime/responsive-layout.js";
const stripTerminalSequences=(text:string)=>text.replace(/\x1b\[[0-9;]*m/gu,"");
import {createAsenExtension} from "../extensions/asen.js";

function baseTheme(){
 const fgNames="accent border borderAccent borderMuted success error warning muted dim text thinkingText scrollbarTrack scrollbarThumb searchMatchText userMessageText customMessageText customMessageLabel toolTitle toolOutput mdHeading mdLink mdLinkUrl mdCode mdCodeBlock mdCodeBlockBorder mdQuote mdQuoteBorder mdHr mdListBullet toolDiffAdded toolDiffRemoved toolDiffContext syntaxComment syntaxKeyword syntaxFunction syntaxVariable syntaxString syntaxNumber syntaxType syntaxOperator syntaxPunctuation thinkingOff thinkingMinimal thinkingLow thinkingMedium thinkingHigh thinkingXhigh thinkingMax bashMode".split(" ");
 const bgNames:ThemeBg[]=["selectedBg","searchMatchBg","userMessageBg","customMessageBg","toolPendingBg","toolSuccessBg","toolErrorBg"];
 return new Theme(Object.fromEntries(fgNames.map(k=>[k,"#ABCDEF"])) as Record<Exclude<ThemeToken,ThemeBg>,string>,Object.fromEntries(bgNames.map(k=>[k,"#203040"])) as Record<ThemeBg,string>,"truecolor",{name:"fixture",appearance:"dark"});
}
async function fixture(t:TestContext){
 // Portable default; this session supplies its explicitly owned audit root.
 const scratch=path.resolve(process.env.ASEN_TEST_ROOT??".cache");
 await mkdir(scratch,{recursive:true});
 const root=await mkdtemp(path.join(scratch,"focus-extension-")),home=path.join(root,"home"),project=path.join(root,"project");
 await Promise.all([mkdir(home),mkdir(project)]);
 const isolated={HOME:home,USERPROFILE:home,XDG_CONFIG_HOME:path.join(root,"config"),XDG_CACHE_HOME:path.join(root,"cache"),XDG_DATA_HOME:path.join(root,"data"),TMPDIR:path.join(root,"tmp"),TMP:path.join(root,"tmp"),TEMP:path.join(root,"tmp"),ASEN_NO_SKILL_REGISTRY:"1"};
 const prior=new Map(Object.keys(isolated).map(k=>[k,process.env[k]]));
 for(const [key,value] of Object.entries(isolated)){if(key!=="ASEN_NO_SKILL_REGISTRY")await mkdir(value,{recursive:true});process.env[key]=value;}
 const commands=new Map<string,any>(),events=new Map<string,Function[]>(),statuses=new Map<string,string|undefined>(),themeWrites:unknown[]=[],headers:any[]=[];
 let current=baseTheme(),effects=0,rejectTheme=false;
 const pi={registerCommand(name:string,command:any){commands.set(name,command);},registerTool(){},on(name:string,fn:Function){events.set(name,[...(events.get(name)??[]),fn]);},getFlag(){return false;},getCommands(){return [];},getAllTools(){return [];},setModel(){effects++;return false;},sendMessage(){effects++;}};
 const ui:any={get theme(){return current;},notify(){},setStatus(k:string,v:string|undefined){statuses.set(k,v);},setWidget(){},
  setTheme(value:unknown){themeWrites.push(value);assert.ok(value instanceof Theme,"only runtime instances, never persisted names");if(rejectTheme)return {success:false,error:"unavailable"};current=value;return {success:true};},
  setHeader(factory:any){headers.push(factory);},setFooter(){effects++;},confirm(){effects++;return false;},
 };
 const ctx:any={cwd:project,mode:"tui",hasUI:true,model:{provider:"p",id:"m"},thinkingLevel:"high",getContextUsage:()=>({tokens:20,contextWindow:100,percent:20}),sessionManager:{getSessionId:()=>"focus-session"},ui};
 createAsenExtension({homeDir:()=>home,packageRoot:root,registryLifecycle:{watch:()=>({close(){}})},autoAdvancePlans:false,enableAgentRuntime:false,enableTodoRuntime:false,enableWorkspaceRuntime:false,enableMemoryRuntime:false})(pi);
 const emit=async(name:string)=>{for(const fn of events.get(name)??[])await fn({},ctx);};
 t.after(async()=>{try{await emit("session_shutdown");assert.equal(effects,0,"no model, consent, message or footer/root replacement");}finally{for(const [key,value] of prior){if(value===undefined)delete process.env[key];else process.env[key]=value;}}});
 return {ctx,commands,emit,themeWrites,headers,statuses,theme:()=>current,rejectTheme(){rejectTheme=true;}};
}
test("public TUI startup applies an in-memory focus theme and truthful compact header without changing host facts",async t=>{
 const f=await fixture(t),original=f.theme(),before=JSON.stringify(original.colors);
 await f.emit("session_start");
 assert.equal(f.themeWrites.length,1);assert.equal(f.theme().name,"asen-focus");
 assert.equal(JSON.stringify(original.colors),before,"base theme stays intact");
 assert.equal(f.headers.length,1);
 const header=f.headers[0]({setLayoutRoot(){assert.fail("must not take host transcript root");}},f.theme());
 const version=JSON.parse(await readFile(new URL("../package.json",import.meta.url),"utf8")).version;
 for(const width of [1,6,20,80,160]){
  const lines=header.render(width).map(stripTerminalSequences);
  assert.ok(lines.every((s:string)=>visibleWidth(s)<=width));
  if(width===160){assert.match(lines.join("\n"),/π ASEN/u);assert.ok(lines.join("\n").includes("v"+version));assert.ok(lines.join("\n").includes("Pi "+VERSION));assert.doesNotMatch(lines.join("\n"),/p\/m|responding|cost/u);}
 }
 assert.equal(stripTerminalSequences(f.statuses.get("asen:host")??""),"ASEN │ selected p/m · high │ responding ? │ ctx 20% │ cost/sub ?");
 header.invalidate();
});
test("non-TUI and missing optional UI support retain previous startup/status behaviour",async t=>{
 const f=await fixture(t);
 f.ctx.mode="rpc";await f.emit("session_start");
 f.ctx.mode="print";f.ctx.hasUI=false;await f.emit("session_start");
 assert.deepEqual(f.themeWrites,[]);assert.deepEqual(f.headers,[]);
 assert.equal(f.statuses.get("asen:host"),undefined);
 f.ctx.mode="tui";f.ctx.hasUI=true;delete f.ctx.ui.setTheme;delete f.ctx.ui.setHeader;
 await f.emit("session_start");assert.deepEqual(f.themeWrites,[]);assert.deepEqual(f.headers,[]);
});
test("a refused runtime theme preserves the existing header and does not invent success",async t=>{
 const f=await fixture(t),original=f.theme();f.rejectTheme();
 await f.emit("session_start");
 assert.equal(f.themeWrites.length,1);assert.equal(f.theme(),original);assert.deepEqual(f.headers,[]);
});
test("public panel command receives the actual theme and live floored overlay height",async t=>{
 const f=await fixture(t),terminal={rows:17},options:unknown[]=[];
 let closes=0,painted=0;
 const theme=f.theme(),fg=theme.fg.bind(theme);
 theme.fg=(role,text)=>{painted++;return fg(role,text);};
 f.ctx.ui.custom=async(factory:any,config:any)=>{
  options.push(config);
  const panel=factory({terminal,requestRender(){}},theme,undefined,()=>{closes++;});
  for(const rows of [17,7,3,2,1,20]){
   terminal.rows=rows;
   const lines=panel.render(80);
   assert.ok(lines.length<=Math.max(1,Math.floor(rows*.9)),"actual terminal height "+rows);
   assert.ok(lines.every((s:string)=>visibleWidth(stripTerminalSequences(s))<=80));
  }
  assert.ok(painted>0,"public factory theme must reach the renderer");
  assert.match(panel.render(80)[0],/\x1b\[/u,"styling remains after fitting");
  panel.handleInput("q");
 };
 const result=await f.commands.get("asen-panel").handler("",f.ctx);
 assert.match(String(result),/closed/u);assert.equal(closes,1);
 assert.deepEqual(options,[{overlay:true,overlayOptions:{width:"100%",maxHeight:"90%"}}]);
});
