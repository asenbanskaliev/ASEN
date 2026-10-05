import {realpath} from "node:fs/promises";
import path from "node:path";

export interface WorkflowSelectionChoice {
 readonly workflow:"sdd";
 readonly source:"pi-command";
 readonly taskIdentity:string;
 readonly repositoryIdentity:string;
}
export interface WorkflowSelectionDescription extends WorkflowSelectionChoice {readonly schemaVersion:1}
export interface WorkflowSelectionBinding {readonly taskIdentity:string;readonly repositoryIdentity:string}
declare const consumerBrand:unique symbol;
/** An opaque registration identity. Only this module can associate it with consumer closures. */
export interface WorkflowSelectionConsumer {readonly [consumerBrand]:true}
export interface WorkflowSelectionCommandContext {cwd:string;ui:{notify(message:string,level:"info"|"error"):void}}
export interface WorkflowSelectionCommand {description:string;handler:(args:string|undefined,context:WorkflowSelectionCommandContext)=>Promise<WorkflowSelectionChoice|string>}
export type WorkflowSelectionCommandRegistrar=(name:string,command:WorkflowSelectionCommand)=>void;

type ConsumerClosures={
 read(binding:WorkflowSelectionBinding):WorkflowSelectionChoice|undefined;
 claim(choice:unknown,binding:WorkflowSelectionBinding):WorkflowSelectionChoice;
};
const consumers=new WeakMap<object,ConsumerClosures>();
const admitted=new WeakSet<object>();
const consumedAdmissions=new WeakSet<object>();
const usage="Usage: /asen-workflow sdd <task-id>";
const taskPattern=/^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,127})$/u;

function exactBinding(value:unknown):WorkflowSelectionBinding{
 if(typeof value!=="object"||value===null||Object.getPrototypeOf(value)!==Object.prototype||Reflect.ownKeys(value).length!==2)throw new Error("Workflow selection binding is malformed");
 const task=Object.getOwnPropertyDescriptor(value,"taskIdentity"),repository=Object.getOwnPropertyDescriptor(value,"repositoryIdentity");
 if(!task||!repository||!("value" in task)||!("value" in repository)||typeof task.value!=="string"||typeof repository.value!=="string"||!taskPattern.test(task.value)||!repository.value)throw new Error("Workflow selection binding is malformed");
 return {taskIdentity:task.value,repositoryIdentity:repository.value};
}
function closuresFor(value:unknown):ConsumerClosures{
 if(typeof value!=="object"||value===null)throw new Error("Workflow selection consumer is not genuine");
 const closures=consumers.get(value);if(!closures)throw new Error("Workflow selection consumer is not genuine");return closures;
}
function taskFrom(args:string|undefined):string|undefined{
 if(typeof args!=="string")return undefined;
 const task=/^sdd ([A-Za-z0-9][A-Za-z0-9._-]{0,127})$/u.exec(args)?.[1];
 if(!task||task!==task.normalize("NFC")||!taskPattern.test(task))return undefined;
 return task;
}
function key(binding:WorkflowSelectionBinding):string{return `${binding.repositoryIdentity}\u0000${binding.taskIdentity}`;}

/** Reads through a genuine opaque consumer before inspecting caller-supplied binding data. */
export function readWorkflowSelection(consumer:unknown,binding:WorkflowSelectionBinding):WorkflowSelectionChoice|undefined{return closuresFor(consumer).read(binding);}
/** Claims through a genuine opaque consumer before inspecting the choice or caller-supplied binding data. */
export function claimWorkflowSelection(consumer:unknown,choice:unknown,binding:WorkflowSelectionBinding):WorkflowSelectionChoice{return closuresFor(consumer).claim(choice,binding);}
/** Consumes applicability provenance created by a successful genuine claim. */
export function consumeClaimedWorkflowSelection(choice:unknown):WorkflowSelectionChoice{
 if(typeof choice!=="object"||choice===null||!admitted.has(choice))throw new Error("Workflow selection was not genuinely claimed");
 if(consumedAdmissions.has(choice))throw new Error("Workflow selection applicability proof was already used");
 consumedAdmissions.add(choice);return choice as WorkflowSelectionChoice;
}

/** Registers the only issuer and returns a frozen opaque handle to its actual closures. */
export function registerWorkflowSelectionCommand(registerCommand:WorkflowSelectionCommandRegistrar):WorkflowSelectionConsumer{
 const issued=new WeakSet<object>(),claimed=new WeakSet<object>(),pending=new Map<string,WorkflowSelectionChoice>();
 const read=(bindingValue:WorkflowSelectionBinding)=>pending.get(key(exactBinding(bindingValue)));
 const claim=(choice:unknown,bindingValue:WorkflowSelectionBinding):WorkflowSelectionChoice=>{
  if(typeof choice!=="object"||choice===null||!issued.has(choice))throw new Error(claimed.has(choice as object)?"Workflow selection choice was already used":"Workflow selection choice is not genuine for this extension session");
  issued.delete(choice);claimed.add(choice);
  const expected=choice as WorkflowSelectionChoice;pending.delete(key({taskIdentity:expected.taskIdentity,repositoryIdentity:expected.repositoryIdentity}));
  const binding=exactBinding(bindingValue);
  if(binding.taskIdentity!==expected.taskIdentity||binding.repositoryIdentity!==expected.repositoryIdentity)throw new Error("Workflow selection choice binding mismatch");
  admitted.add(expected);return expected;
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
 const handle=Object.freeze({}) as WorkflowSelectionConsumer;consumers.set(handle,{read,claim});return handle;
}
