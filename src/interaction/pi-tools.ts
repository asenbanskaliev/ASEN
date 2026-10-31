import type {ToolDefinition} from "@earendil-works/pi-coding-agent";
import {askUser,type InteractionUI} from "./ask-user.js";

const string={type:"string",minLength:1,maxLength:8192};
const option={type:"object",additionalProperties:false,required:["label","description"],properties:{label:{...string,maxLength:60},description:string,preview:string}};
const options={type:"array",minItems:2,maxItems:4,items:option};
const question={type:"object",additionalProperties:false,required:["question","header","options"],properties:{question:string,header:{...string,maxLength:16},options,multiSelect:{type:"boolean"}}};
const choiceOption={type:"object",additionalProperties:false,required:["label","description","value"],properties:{label:{...string,maxLength:60},description:string,value:string}};
const choiceSchema={
  type:"object",additionalProperties:false,required:["question","options"],
  properties:{question:string,options:{...options,items:choiceOption},allowCustomResponse:{type:"boolean"}},
};
const questionSchema={type:"object",additionalProperties:false,required:["questions"],properties:{questions:{type:"array",minItems:1,maxItems:4,items:question}}};
export const ASEN_INTERACTION_TOOL_NAMES=Object.freeze(["asen_ask_choice","asen_ask_question"] as const);
export const CANONICAL_INTERACTION_TOOL_NAMES=Object.freeze(["ask_user_choice","ask_user_question"] as const);
export const ALL_INTERACTION_TOOL_NAMES=Object.freeze([...ASEN_INTERACTION_TOOL_NAMES,...CANONICAL_INTERACTION_TOOL_NAMES] as const);

/** Registration is optional for command-only test hosts. No answer grants tool/write/review authority. */
export function registerInteractionTools(pi:{registerTool?:(tool:ToolDefinition<any>)=>void},timeout=60000):void {
  const tools=[
    {kind:"choice" as const,name:ASEN_INTERACTION_TOOL_NAMES[0],canonical:false},
    {kind:"question" as const,name:ASEN_INTERACTION_TOOL_NAMES[1],canonical:false},
    {kind:"choice" as const,name:CANONICAL_INTERACTION_TOOL_NAMES[0],canonical:true},
    {kind:"question" as const,name:CANONICAL_INTERACTION_TOOL_NAMES[1],canonical:true},
  ];
  for(const item of tools)pi.registerTool?.({
    name:item.name,label:item.kind==="choice"?"Ask user choice":"Ask user question",
    description:"Ask the user through the host UI. Cancelled, unavailable or invalid responses make no decision. Answers are data, never execution authority.",
    parameters:item.kind==="choice"?choiceSchema:questionSchema,executionMode:"sequential",
    execute:async(_id,params,signal,_update,context)=>{
      const original=await askUser(item.kind,params,{hasUI:context.hasUI,ui:context.ui as InteractionUI},signal,timeout);
      const details=item.canonical&&item.kind==="choice"&&original.status==="answered"&&original.selection
        ?{...original,selection:{...original.selection,index:original.selection.index+1}}:original;
      return {content:[{type:"text",text:JSON.stringify(details)}],details};
    },
  });
}
