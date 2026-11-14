import {types} from "node:util";

export interface InteractionUI {
  select(title:string,options:string[],opts:{signal:AbortSignal;timeout:number}):Promise<string|undefined>;
  input?(title:string,placeholder:string,opts:{signal:AbortSignal;timeout:number}):Promise<string|undefined>;
}
type Option={label:string;description:string;value?:string;preview?:string};
type Question={question:string;header:string;options:Option[];multiSelect?:boolean};
type Choice={question:string;options:Option[];allowCustomResponse?:boolean};
type Outcome={status:string;selection?:{value:string;label:string;index:number};customResponse?:string;answers?:unknown[]};
const active=new WeakSet<object>();
const CUSTOM="Other",DONE="Done";

/** Snapshot untrusted JSON without invoking accessors; no decision is authority. */
function snapshot(value:unknown,depth=0,budget={bytes:0,nodes:0}):any {
  if(depth>6||++budget.nodes>512)throw Error("Invalid input");
  if(typeof value==="string"){budget.bytes+=Buffer.byteLength(value);if(budget.bytes>32768||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))throw Error("Invalid text");return value;}
  if(typeof value==="boolean"||value===null)return value;
  if(!value||typeof value!=="object"||types.isProxy(value))throw Error("Invalid object");
  const array=Array.isArray(value);
  if(!array&&Object.getPrototypeOf(value)!==Object.prototype)throw Error("Invalid record");
  const keys=Reflect.ownKeys(value),out:any=array?[]:{};
  if(keys.length>32||keys.some(key=>typeof key!=="string"))throw Error("Invalid keys");
  if(array&&(value.length>4||keys.length!==value.length+1))throw Error("Invalid array");
  for(const key of keys){if(array&&key==="length")continue;const descriptor=Object.getOwnPropertyDescriptor(value,key)!;
    if(!("value" in descriptor)||!descriptor.enumerable||key==="__proto__")throw Error("Invalid descriptor");
    if(array&&!/^(0|[1-9]\d*)$/.test(key as string))throw Error("Invalid array key");
    out[key]=snapshot(descriptor.value,depth+1,budget);
  }
  return out;
}
function exact(value:any,required:string[],optional:string[]=[]):void {
  if(!value||Array.isArray(value)||required.some(key=>!Object.hasOwn(value,key))||Object.keys(value).some(key=>!required.includes(key)&&!optional.includes(key)))throw Error("Invalid fields");
}
function text(value:any,max=8192):void {if(typeof value!=="string"||!value.trim()||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))throw Error("Invalid text");}
function options(value:any,choice:boolean):void {
  if(!Array.isArray(value)||value.length<2||value.length>4)throw Error("Invalid options");
  const labels=new Set(),tokens=new Set();
  for(const option of value){exact(option,["label","description",...(choice?["value"]:[])],choice?[]:["preview"]);text(option.label,60);text(option.description);
    const label=option.label.normalize("NFC").trim();if(labels.has(label)||[CUSTOM,DONE,"Type something."].includes(label))throw Error("Ambiguous labels");labels.add(label);
    if(choice){text(option.value);if(tokens.has(option.value))throw Error("Ambiguous values");tokens.add(option.value);}
    if(option.preview!==undefined)text(option.preview);
  }
}
function validate(value:any,kind:"choice"|"question"):Choice|{questions:Question[]} {
  if(kind==="choice"){exact(value,["question","options"],["allowCustomResponse"]);text(value.question);options(value.options,true);if(value.allowCustomResponse!==undefined&&typeof value.allowCustomResponse!=="boolean")throw Error("Invalid custom response");}
  else {
    exact(value,["questions"]);if(!Array.isArray(value.questions)||!value.questions.length||value.questions.length>4)throw Error("Invalid questions");const seen=new Set();
    for(const question of value.questions){exact(question,["question","header","options"],["multiSelect"]);text(question.question);text(question.header,16);options(question.options,false);
      const key=question.question.normalize("NFC").trim();if(seen.has(key))throw Error("Duplicate question");seen.add(key);
      if(question.multiSelect!==undefined&&typeof question.multiSelect!=="boolean")throw Error("Invalid multiselect");
    }
  }
  return value;
}
class Interrupted extends Error {constructor(readonly status:"cancelled"|"timeout"){super(status);}}

/** Public Pi UI primitives support both TUI and interactive RPC; unavailable print hosts fail closed. */
export async function askUser(kind:"choice"|"question",params:unknown,context:{hasUI?:boolean;ui?:InteractionUI},signal?:AbortSignal,timeout=60000):Promise<Outcome> {
  let input:Choice|{questions:Question[]};try{input=validate(snapshot(params),kind);}catch{return {status:"invalid"};}
  if(!Number.isSafeInteger(timeout)||timeout<1||timeout>60000)return {status:"invalid"};
  if(signal?.aborted)return {status:"cancelled"};
  const ui=context.ui;if(!context.hasUI||!ui||typeof ui.select!=="function")return {status:"unavailable"};
  if(active.has(ui))return {status:"busy"};active.add(ui);
  const controller=new AbortController();let terminal:"cancelled"|"timeout"="cancelled";
  const abort=()=>controller.abort();signal?.addEventListener("abort",abort,{once:true});
  const timer=setTimeout(()=>{terminal="timeout";controller.abort();},timeout);
  const interrupted=new Promise<never>((_resolve,reject)=>controller.signal.addEventListener("abort",()=>reject(new Interrupted(terminal)),{once:true}));
  let finished=false,inFlight=0;
  const release=()=>{if(finished&&inFlight===0)active.delete(ui);};
  const dialog=async<T>(run:()=>Promise<T>):Promise<T>=>{
    if(controller.signal.aborted)throw new Interrupted(terminal);inFlight++;
    const pending=Promise.resolve().then(()=>{if(controller.signal.aborted)throw new Interrupted(terminal);return run();}).finally(()=>{inFlight--;release();});
    return Promise.race([pending,interrupted]);
  };
  const opts={signal:controller.signal,timeout};
  const rows=(list:Option[])=>list.map((o,index)=>`${index+1}. ${o.label} — ${o.description}${o.preview?"\n"+o.preview:""}`);
  const custom=async()=>{if(!ui.input)throw Error("Unavailable text input");const value=await dialog(()=>ui.input!("Custom response","Enter response",opts));if(value===undefined)throw new Interrupted("cancelled");text(value);if(Buffer.byteLength(value)>32768)throw Error("Oversized response");return value;};
  try {
    if(kind==="choice"){
      const choice=input as Choice,labels=rows(choice.options);if(choice.allowCustomResponse)labels.push(CUSTOM);
      const selected=await dialog(()=>ui.select(choice.question,labels,opts));if(selected===undefined)return {status:"cancelled"};
      if(choice.allowCustomResponse&&selected===CUSTOM)return {status:"answered",customResponse:await custom()};
      const index=labels.indexOf(selected),option=choice.options[index];if(!option)return {status:"invalid_response"};
      return {status:"answered",selection:{value:option.value!,label:option.label,index}};
    }
    const answers=[];
    for(const [questionIndex,question] of (input as {questions:Question[]}).questions.entries()){
      const labels=rows(question.options),title=`${question.header}: ${question.question}`;
      if(!question.multiSelect){
        const selected=await dialog(()=>ui.select(title,[...labels,CUSTOM],opts));if(selected===undefined)return {status:"cancelled"};
        if(selected===CUSTOM)answers.push({questionIndex,question:question.question,kind:"custom",answer:await custom(),selected:[]});
        else {const index=labels.indexOf(selected);if(index<0)return {status:"invalid_response"};answers.push({questionIndex,question:question.question,kind:"single",answer:question.options[index]!.label,selected:[]});}
      }else{
        const selected=new Set<number>();let complete=false;
        for(let round=0;round<32;round++){
          const toggles=labels.map((label,index)=>`${selected.has(index)?"[x]":"[ ]"} ${label}`);
          const picked=await dialog(()=>ui.select(title,[...toggles,DONE],opts));if(picked===undefined)return {status:"cancelled"};
          if(picked===DONE){complete=true;break;}const index=toggles.indexOf(picked);if(index<0)return {status:"invalid_response"};
          if(selected.has(index))selected.delete(index);else selected.add(index);
          if(selected.size===labels.length){complete=true;break;}
        }
        if(!complete)return {status:"cancelled"};
        answers.push({questionIndex,question:question.question,kind:"multi",answer:null,selected:question.options.filter((_o,index)=>selected.has(index)).map(o=>o.label)});
      }
    }
    return {status:"answered",answers};
  }catch(error){return {status:error instanceof Interrupted?error.status:"failed"};}
  finally{clearTimeout(timer);signal?.removeEventListener("abort",abort);finished=true;release();}
}
