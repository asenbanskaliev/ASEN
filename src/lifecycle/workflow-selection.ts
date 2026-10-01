import {realpath} from "node:fs/promises";
import path from "node:path";

export interface WorkflowSelectionChoice {
 readonly workflow:"sdd";
 readonly source:"pi-command";
 readonly taskIdentity:string;
 readonly repositoryIdentity:string;
}
export interface WorkflowSelectionBinding {readonly taskIdentity:string;readonly repositoryIdentity:string}
export interface WorkflowSelectionConsumer {
 read(binding:WorkflowSelectionBinding):WorkflowSelectionChoice|undefined;
 claim(choice:unknown,binding:WorkflowSelectionBinding):WorkflowSelectionChoice;
}
export interface WorkflowSelectionCommandContext {cwd:string;ui:{notify(message:string,level:"info"|"error"):void}}
export interface WorkflowSelectionCommand {description:string;handler:(args:string|undefined,context:WorkflowSelectionCommandContext)=>Promise<WorkflowSelectionChoice|string>}
export type WorkflowSelectionCommandRegistrar=(name:string,command:WorkflowSelectionCommand)=>void;

const usage="Usage: /asen-workflow sdd <task-id>";
const taskPattern=/^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,127})$/u;

function exactBinding(value:unknown):WorkflowSelectionBinding{
 if(typeof value!=="object"||value===null||Object.getPrototypeOf(value)!==Object.prototype||Reflect.ownKeys(value).length!==2)throw new Error("Workflow selection binding is malformed");
 const task=Object.getOwnPropertyDescriptor(value,"taskIdentity"),repository=Object.getOwnPropertyDescriptor(value,"repositoryIdentity");
 if(!task||!repository||!Object.hasOwn(task,"value")||!Object.hasOwn(repository,"value")||typeof task.value!=="string"||typeof repository.value!=="string"||!taskPattern.test(task.value)||!repository.value)throw new Error("Workflow selection binding is malformed");
 return {taskIdentity:task.value,repositoryIdentity:repository.value};
}
function taskFrom(args:string|undefined):string|undefined{
 if(typeof args!=="string")return undefined;
 const task=/^sdd ([A-Za-z0-9][A-Za-z0-9._-]{0,127})$/u.exec(args)?.[1];
 if(!task||task!==task.normalize("NFC")||!taskPattern.test(task))return undefined;
 return task;
}
function key(binding:WorkflowSelectionBinding):string{return `${binding.repositoryIdentity}\u0000${binding.taskIdentity}`;}

/** Registers the only issuer and returns its registration-scoped, one-use consumer. */
export function registerWorkflowSelectionCommand(registerCommand:WorkflowSelectionCommandRegistrar):WorkflowSelectionConsumer{
 const issued=new WeakSet<object>(),claimed=new WeakSet<object>(),pending=new Map<string,WorkflowSelectionChoice>();
 const read=(binding:WorkflowSelectionBinding)=>pending.get(key(exactBinding(binding)));
 const claim=(choice:unknown,bindingValue:WorkflowSelectionBinding):WorkflowSelectionChoice=>{
  if(typeof choice!=="object"||choice===null||!issued.has(choice))throw new Error(claimed.has(choice as object)?"Workflow selection choice was already used":"Workflow selection choice is not genuine for this extension session");
  issued.delete(choice);claimed.add(choice);
  const expected=choice as WorkflowSelectionChoice;pending.delete(key({taskIdentity:expected.taskIdentity,repositoryIdentity:expected.repositoryIdentity}));
  const binding=exactBinding(bindingValue);
  if(binding.taskIdentity!==expected.taskIdentity||binding.repositoryIdentity!==expected.repositoryIdentity)throw new Error("Workflow selection choice binding mismatch");
  return expected;
 };
 registerCommand("asen-workflow",{description:"Select SDD for one ASEN task",handler:async(args,context)=>{
  const taskIdentity=taskFrom(args);
  if(!taskIdentity){context.ui.notify(usage,"info");return usage;}
  let repositoryIdentity:string;
  try{repositoryIdentity=path.normalize(await realpath(path.resolve(context.cwd)));}
  catch(error){context.ui.notify("ASEN workflow selection failed: repository path is unavailable.","error");throw error;}
  const binding={taskIdentity,repositoryIdentity},pendingKey=key(binding);
  if(pending.has(pendingKey))throw new Error("Workflow selection already pending for this task and repository");
  const choice=Object.freeze({workflow:"sdd" as const,source:"pi-command" as const,taskIdentity,repositoryIdentity});
  issued.add(choice);pending.set(pendingKey,choice);context.ui.notify(`SDD workflow selected for task ${taskIdentity}.`,"info");return choice;
 }});
 return Object.freeze({read,claim});
}
