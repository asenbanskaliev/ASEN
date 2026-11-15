import {pendingAgentQuestion,type AgentStoreEntry} from "./agent-store.js";
import {sanitizeTerminalText,truncateForTerminal,visibleWidth} from "../responsive-layout.js";

const EVENT_LIMIT=40,PROMPT_LIMIT=4000,OUTPUT_LIMIT=4000,BLOCK_LINES=24;
const clean=(value:string,max=400)=>sanitizeTerminalText(value).replace(/\s+/gu," ").trim().slice(0,max);

/** Greedy wrap that reports whether anything was dropped, so the view never claims a fidelity it lost. */
function wrap(text:string,width:number,maxLines:number):{lines:string[];truncated:boolean}{
 const words=sanitizeTerminalText(text).split(/\s+/u).filter(Boolean);
 const lines:string[]=[];let line="";
 for(const word of words){
  const candidate=line===""?word:line+" "+word;
  if(line!==""&&visibleWidth(candidate)>width){
   lines.push(line);
   if(lines.length>=maxLines)return {lines,truncated:true};
   line=word;
  }else line=candidate;
 }
 if(line!==""){lines.push(line);return {lines,truncated:false};}
 return {lines,truncated:false};
}

/**
 * Read-only projection of one durable agent entry: the submitted prompt, the recorded state
 * changes, the authenticated result and any pending question. It never claims the child
 * model's reasoning or tool stream, and it grants no approval, publication or delivery authority.
 */
export function renderAgentConversation(view:AgentStoreEntry,width=100):readonly string[]{
 if(!Number.isSafeInteger(width)||width<12||width>1000)throw new Error("Invalid agent conversation width");
 const {record,request,events,result}=view;
 const question=pendingAgentQuestion(record);
 const gutter=2;
 const rows:string[]=[
  "AGENT CONVERSATION · "+clean(record.role,40)+" · "+clean(record.state,30),
  "Task: "+clean(record.id,180),
  "Project: "+clean(record.projectId,140),
  "Thread: "+clean(record.sessionId,90),
  "Owner: "+clean(record.owner.kind,16)+" · "+clean(record.owner.id,90),
  "Durable record, not the model transcript:",
  "  Shows: the submitted prompt, the recorded state changes, the authenticated result and any pending question.",
  "  Cannot show: the child model's reasoning or tool stream; Pi does not publish it to this store.",
  "",
  "PROMPT (submitted, "+request.prompt.length+" characters):",
 ];
 const promptBody=request.prompt.slice(0,PROMPT_LIMIT);
 const promptWrap=wrap(promptBody,Math.max(8,width-gutter),BLOCK_LINES);
 for(const line of promptWrap.lines)rows.push(" ".repeat(gutter)+line);
 if(promptWrap.truncated||request.prompt.length>promptBody.length)rows.push(" ".repeat(gutter)+"… truncated; the full prompt remains in the durable store");

 rows.push("","STATE CHANGES ("+events.length+" recorded):");
 const sorted=[...events].sort((a,b)=>a.revision-b.revision);
 for(const event of sorted.slice(-EVENT_LIMIT)){
  rows.push(" ".repeat(gutter)+clean(event.at,32)+" · "+clean(event.state,24)+" · #"+event.revision+
   (event.summary===undefined?"":" · "+clean(event.summary,120)));
 }
 if(events.length>EVENT_LIMIT)rows.push(" ".repeat(gutter)+"… "+(events.length-EVENT_LIMIT)+" older events omitted");

 rows.push("");
 if(result===undefined){
  rows.push("RESULT: No authenticated result recorded for this agent.");
 }else{
  rows.push("RESULT (authenticated, sha256 "+clean(result.sha256,12)+"…, "+result.output.length+" characters):");
  const outputBody=result.output.slice(0,OUTPUT_LIMIT);
  const outputWrap=wrap(outputBody,Math.max(8,width-gutter),BLOCK_LINES);
  for(const line of outputWrap.lines)rows.push(" ".repeat(gutter)+line);
  if(outputWrap.truncated||result.output.length>outputBody.length)rows.push(" ".repeat(gutter)+"… truncated; the full output remains in the durable store");
 }

 rows.push("");
 if(question===undefined){
  rows.push("PENDING QUESTION: none recorded.");
 }else{
  rows.push("PENDING QUESTION (asked "+clean(new Date(question.askedAt).toISOString(),32)+"):");
  for(const line of wrap(question.text,Math.max(8,width-gutter),4).lines)rows.push(" ".repeat(gutter)+line);
 }

 rows.push("","This view reports stored facts only; it grants no approval, publication or delivery authority.");
 return Object.freeze(rows.map(row=>truncateForTerminal(row,width)));
}
