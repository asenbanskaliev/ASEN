#!/usr/bin/env node
import {existsSync,readdirSync,readFileSync,statSync} from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";

const load=createRequire(import.meta.url);
const ts=load("typescript");
const MAX_SCC_SIZE=5;
const extensions=[".ts",".tsx",".mts",".cts"];
const runtimeRoots=new Set([
 "command-registry.ts","pi-host.ts","responsive-layout.ts","task-replay.ts","task-store.ts",
 "workspace-attribution.ts","workspace-lock-table.ts","workspace-resolution.ts","workspace-snapshot.ts","workspace-store.ts",
]);
const movedRuntimeModules=new Set([
 "activity-stream.ts","agent-conversation.ts","agent-inspect.ts","agent-lifecycle.ts","agent-notification-journal.ts","agent-store.ts","agent-terminal-delivery.ts","agents-panel.ts","asen-uninstall.ts","authorized-job-retry.ts","authorized-write-recovery.ts","background-job-journal.ts","background-job-tools.ts","background-jobs.ts","browser-assistant.ts","cli-usage.ts","command-catalog.ts","command-guide.ts","command-palette.ts","desktop-rpc.ts","doctor.ts","eco07-provider-failure.ts","explorer-budget.ts","explorer-read-policy.ts","fast-mode-policy.ts","focus-chrome.ts","focus-theme.ts","git-diff-preview.ts","guide-tour.ts","history-command.ts","history-selector.ts","history-store.ts","history.ts","home-backup.ts","host-status-projection.ts","ide-panel.ts","image-disk-cache.ts","installation-doctor.ts","integration-profile-inspection.ts","integrations-panel.ts","interrupted-write-inspection.ts","job-inspect.ts","keymaps.ts","language.ts","launcher.ts","lifecycle-cli.ts","m1-readonly-rail.ts","maintenance-plan.ts","managed-acquisition-copy.ts","managed-acquisition-update.ts","managed-acquisition-verification.ts","managed-cli-version-probe.ts","managed-fetch.ts","managed-install.ts","managed-lifecycle.ts","managed-maintenance-lock.ts","managed-selected-launch.ts","managed-trust.ts","managed-update-preview.ts","managed-version-verification.ts","model-fallback-notice.ts","model-fallback-policy.ts","native-command-palette.ts","native-m2-navigator.ts","native-work-panel.ts","natural-plan-tool.ts","notice-ring-buffer.ts","notification-projection.ts","parallel-writer-readiness.ts","parent-model-fallback.ts","persona.ts","pi-todo-tools.ts","plan-context.ts","plan-dispatcher.ts","presentation.ts","profile-fallback-store.ts","profile-fallback.ts","profile-store.ts","profiles.ts","project-memory-backup-preview.ts","provider-registry.ts","reply-language-anchor.ts","request-guidance.ts","review-acceptance.ts","review-panel.ts","route-command.ts","session-directory.ts","session-notifications.ts","session-orchestrator.ts","session-profile-binding.ts","setup.ts","shared-session-directory.ts","shortcuts.ts","startup-flow.ts","status.ts","task-agent-coordinator.ts","task-agent-link-store.ts","task-agent-reconciler.ts","todo-presentation.ts","todo-store.ts","trusted-task-agent-binder.ts","update-notifier.ts","usage-command.ts","usage-store.ts","usage.ts","voice-dictation.ts","workspace-writer-lease.ts",
]);

function filesIn(directory){
 const result=[];
 for(const entry of readdirSync(directory,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
  const full=path.join(directory,entry.name);
  if(entry.isDirectory())result.push(...filesIn(full));
  else if(extensions.includes(path.extname(entry.name))&&!entry.name.endsWith(".d.ts"))result.push(full);
 }
 return result;
}
function isErasedTypeOnlyEdge(statement){
 if(ts.isImportDeclaration(statement)){
  const clause=statement.importClause;
  return clause?.isTypeOnly===true||(!clause?.name&&clause?.namedBindings&&ts.isNamedImports(clause.namedBindings)&&clause.namedBindings.elements.length>0&&clause.namedBindings.elements.every(element=>element.isTypeOnly));
 }
 if(ts.isExportDeclaration(statement)){
  const clause=statement.exportClause;
  return statement.isTypeOnly===true||(clause&&ts.isNamedExports(clause)&&clause.elements.length>0&&clause.elements.every(element=>element.isTypeOnly));
 }
 return false;
}
function importSpecifiers(file){
 const source=ts.createSourceFile(file,readFileSync(file,"utf8"),ts.ScriptTarget.Latest,true);
 return source.statements.flatMap(statement=>{
  // Type-only edges are erased before runtime and cannot participate in ESM initialization.
  if((ts.isImportDeclaration(statement)||ts.isExportDeclaration(statement))&&isErasedTypeOnlyEdge(statement))return [];
  if((ts.isImportDeclaration(statement)||ts.isExportDeclaration(statement))&&statement.moduleSpecifier&&ts.isStringLiteral(statement.moduleSpecifier))return [statement.moduleSpecifier.text];
  return [];
 });
}
function resolveRelative(from,specifier,known){
 if(!specifier.startsWith("./")&&!specifier.startsWith("../"))return undefined;
 const base=path.resolve(path.dirname(from),specifier);
 const candidates=[];
 if(path.extname(base)){
  candidates.push(base);
  if([".js",".jsx",".mjs",".cjs"].includes(path.extname(base)))candidates.push(...extensions.map(extension=>base.slice(0,base.lastIndexOf("."))+extension));
 }else candidates.push(...extensions.map(extension=>base+extension),...extensions.map(extension=>path.join(base,"index"+extension)));
 return candidates.find(candidate=>known.has(candidate));
}
function tarjan(graph){
 let index=0;
 const indexes=new Map(),lowlinks=new Map(),stack=[],active=new Set(),components=[];
 const visit=node=>{
  indexes.set(node,index);lowlinks.set(node,index);index+=1;stack.push(node);active.add(node);
  for(const target of graph.get(node)??[]){
   if(!indexes.has(target)){visit(target);lowlinks.set(node,Math.min(lowlinks.get(node),lowlinks.get(target)));}
   else if(active.has(target))lowlinks.set(node,Math.min(lowlinks.get(node),indexes.get(target)));
  }
  if(lowlinks.get(node)===indexes.get(node)){
   const component=[];let item;
   do{item=stack.pop();active.delete(item);component.push(item);}while(item!==node);
   components.push(component.sort());
  }
 };
 for(const node of [...graph.keys()].sort())if(!indexes.has(node))visit(node);
 return components;
}
function display(root,file){return path.relative(root,file).split(path.sep).join("/");}
function executableFiles(root){
 const directories=["src","extensions","tests","scripts",".github/workflows"];
 const result=[];
 const visit=directory=>{
  for(const entry of readdirSync(directory,{withFileTypes:true})){
   const full=path.join(directory,entry.name);
   if(entry.isDirectory())visit(full);
   else if([".ts",".mjs",".yml",".yaml"].includes(path.extname(entry.name))&&!entry.name.endsWith(".d.ts"))result.push(full);
  }
 };
 for(const directory of directories){
  const full=path.join(root,directory);
  if(existsSync(full))visit(full);
 }
 return result.filter(file=>!file.includes(`${path.sep}fixtures${path.sep}`));
}
function checkRuntimeLayout(root,directory){
 if(path.basename(directory)==="src"){}else return [];
 const runtime=path.join(directory,"runtime");
 const flat=readdirSync(runtime,{withFileTypes:true}).filter(entry=>entry.isFile()&&entry.name.endsWith(".ts")&&!runtimeRoots.has(entry.name)).map(entry=>entry.name).sort();
 const errors=[];
 if(flat.length)errors.push(`Runtime layout has unapproved flat modules: ${flat.join(", ")}`);
 const stalePattern=new RegExp(`src/runtime/(${[...movedRuntimeModules].map(name=>name.replaceAll(".","\\.")).join("|")})`);
 for(const file of executableFiles(root)){
  const source=readFileSync(file,"utf8");
  if(stalePattern.test(source))errors.push(`Stale moved-runtime path in ${display(root,file)}`);
 }
 return errors;
}
function check(root){
 const directory=path.resolve(root);
 if(!existsSync(directory)||!statSync(directory).isDirectory())throw new Error(`TypeScript directory not found: ${root}`);
 const files=filesIn(directory).map(file=>path.resolve(file)).sort();
 const known=new Set(files),graph=new Map(files.map(file=>[file,[]]));
 for(const file of files)graph.set(file,importSpecifiers(file).map(specifier=>resolveRelative(file,specifier,known)).filter(Boolean));
 const components=tarjan(graph).map(component=>component.map(file=>display(directory,file)).sort()).sort((a,b)=>b.length-a.length||a.join("\0").localeCompare(b.join("\0")));
 const violating=components.filter(component=>component.length>MAX_SCC_SIZE);
 if(violating.length){
  console.error(`Import cycle limit exceeded: ${violating[0].length} modules (maximum ${MAX_SCC_SIZE})`);
  for(const component of violating)console.error(`  ${component.join(" -> ")}`);
  return 1;
 }
 const layoutErrors=checkRuntimeLayout(path.dirname(directory),directory);
 if(layoutErrors.length){
  for(const error of layoutErrors)console.error(error);
  return 1;
 }
 const largest=components[0]?.length??0;
 console.log(`Import cycle check passed: largest SCC is ${largest} modules (maximum ${MAX_SCC_SIZE})`);
 const cyclic=components.filter(component=>component.length>1);
 if(cyclic.length)console.log(`Cyclic SCCs: ${cyclic.map(component=>`${component.length} [${component.join(", ")}]`).join("; ")}`);
 return 0;
}

const root=process.argv[2]??"src";
try{process.exitCode=check(root);}catch(error){console.error(error instanceof Error?error.message:String(error));process.exitCode=1;}
