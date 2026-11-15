/*
 * Portions derived from reference-pi's destructive command recognizer.
 * MIT License
 * Copyright (c) 2025 Mario Zechner
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
import {dataArgumentRanges,shellCommandHeadIndex,tokenizeShellCommand,type ShellToken} from "./shell-command-syntax.js";

export type DestructionKind="database"|"filesystem"|"git";
export interface DestructiveCommandMatch{
 readonly kind:DestructionKind;
 readonly triggerIndex:number;
 readonly hardDeny:boolean;
 readonly removalTargets?:readonly string[];
}

const executable=(value:string)=>value.split("/").at(-1)??value;
const sequentialSeparators=new Set(["",";","&&","||","\n"]);
const databaseClients=new Set(["psql","mysql","mariadb","sqlite3"]);
const shells=new Set(["sh","bash","zsh","dash"]);
const gitValueOptions=new Set(["-C","-c","--git-dir","--work-tree","--namespace"]);
const heredocPattern=/<<-?\s*(['"]?)([A-Za-z_]\w*)\1[^\n]*\n([\s\S]*?)\n\2(?=\n|$)/;
const heredocBodiesPattern=/<<-?\s*(['"]?)([A-Za-z_]\w*)\1[^\n]*\n[\s\S]*?\n\2(?=\n|$)/g;

const blankHeredocs=(command:string)=>command.replace(heredocBodiesPattern,raw=>{
 const header=raw.indexOf("\n")+1;
 return raw.slice(0,header)+" ".repeat(raw.length-header);
});

const freezeMatches=(matches:DestructiveCommandMatch[])=>Object.freeze(matches.map(match=>Object.freeze({
 ...match,
 ...(match.removalTargets?{removalTargets:Object.freeze([...match.removalTargets])}:{}),
})));

function sqlDestroys(sql:string):boolean{
 const code=sql.replace(/--[^\n]*|\/\*[\s\S]*?\*\/|'(?:''|[^'])*'|"(?:""|[^"])*"|`(?:``|[^`])*`|\[(?:\]\]|[^\]])*\]/g,
  raw=>/^["`\[]/.test(raw)?"identifier":" ");
 return code.split(";").some(statement=>{
  if(/^\s*(?:DROP\s+(?:TABLE|DATABASE|SCHEMA|INDEX|VIEW)\b|TRUNCATE\s+(?:TABLE\s+)?\S)/i.test(statement))return true;
  if(!/^\s*DELETE\s+FROM\s+\S/i.test(statement))return false;
  return !/\bWHERE\b/i.test(statement)||/\bWHERE\s+(?:1\s*=\s*1|TRUE)\s*$/i.test(statement.trim());
 });
}

function literalRemovalTargets(args:readonly ShellToken[]):readonly string[]|undefined{
 const targets:string[]=[];let options=true;
 for(const arg of args){
  if(arg.raw!==arg.value||arg.value==="--no-preserve-root")return undefined;
  if(options&&arg.value==="--")options=false;
  else if(options&&arg.value.startsWith("-"))continue;
  else targets.push(arg.value);
 }
 return targets.length>0?targets:undefined;
}

function backtickBodies(command:string):Array<{body:string;index:number}>{
 const bodies:Array<{body:string;index:number}>=[],source=blankHeredocs(command);let quote:"'"|'"'|undefined;
 for(let index=0;index<source.length;index++){
  const char=source[index];
  if(quote==="'"){if(char==="'")quote=undefined;continue;}
  if(char==="\\"){index++;continue;}
  if(char==="'"&&quote===undefined){quote="'";continue;}
  if(char==='"'){quote=quote==='"'?undefined:'"';continue;}
  if(char!=="`")continue;
  let end=index+1;
  while(end<source.length&&source[end]!=="`")end+=source[end]==="\\"?2:1;
  if(end>=source.length)break;
  bodies.push({body:source.slice(index+1,end).replace(/\\([\\$`])/g,"$1"),index});
  index=end;
 }
 return bodies;
}

function recognize(command:string,depth:number):DestructiveCommandMatch[]{
 if(depth>4)return [];
 const tokens=tokenizeShellCommand(command),matches:DestructiveCommandMatch[]=[];
 let previous:readonly ShellToken[]=[],previousSeparator="",leadingRemovals=depth===0,start=0;
 for(let end=0;end<=tokens.length;end++){
  if(end<tokens.length&&!tokens[end]?.operator)continue;
  const segment=tokens.slice(start,end),cursor=shellCommandHeadIndex(segment),head=segment[cursor];
  const name=executable(head?.value??""),args=segment.slice(cursor+1).map(token=>token.value);
  const add=(kind:DestructionKind,hardDeny=false)=>{if(head)matches.push({kind,triggerIndex:head.index,hardDeny});};
  if(shells.has(name)){
   const flag=args.findIndex(arg=>/^-[a-z]*c[a-z]*$/.test(arg));
   const payload=args[flag+1];
   if(flag>=0&&payload)matches.push(...recognize(payload,depth+1).map(match=>({...match,triggerIndex:head!.index})));
  }
  if(name==="eval"){
   const payload=(args[0]==="--"?args.slice(1):args).join(" ");
   matches.push(...recognize(payload,depth+1).map(match=>({...match,triggerIndex:head!.index})));
  }
  if(databaseClients.has(name)){
   const payloads=args.map(arg=>arg.replace(/^(?:--command|--execute)=/,""));
   const heredoc=command.slice(head!.index).match(heredocPattern);
   if(heredoc?.[3])payloads.push(heredoc[3]);
   if(previousSeparator==="|"&&new Set(["echo","printf"]).has(executable(previous[0]?.value??"")))
    payloads.push(previous.slice(1).map(token=>token.value).join(" ").replace(/^%s\s*/,""));
   if(payloads.some(sqlDestroys))add("database");
  }
  const recursiveRm=name==="rm"&&args.some(arg=>/^-[^-]*[rR]/.test(arg)||arg==="--recursive");
  if(recursiveRm){
   const rootTarget=args.some(arg=>/^(?:\/(?:\*+)?$|\.{1,2}\/?$|~(?:\/|$)|\$\{?HOME\}?(?:\/|$))/.test(arg));
   add("filesystem",rootTarget);
   const direct=leadingRemovals&&sequentialSeparators.has(tokens[end]?.raw??"")&&cursor===0&&head?.raw==="rm";
   const targets=direct?literalRemovalTargets(segment.slice(1)):undefined;
   if(targets)matches[matches.length-1]={...matches[matches.length-1]!,removalTargets:targets};
   else leadingRemovals=false;
  }else if(segment.length>0||tokens[end]?.raw!=="\n")leadingRemovals=false;
  if(name==="find"){
   if(args.includes("-delete"))add("filesystem");
   for(let index=0;index<args.length;index++){
    if(!["-exec","-execdir"].includes(args[index]??""))continue;
    const invocation=segment.slice(cursor+index+2),stop=invocation.findIndex(token=>token.value===";"||token.value==="+");
    const nested=(stop<0?invocation:invocation.slice(0,stop)).map(token=>token.raw).join(" ");
    matches.push(...recognize(nested,depth+1).map(match=>({...match,triggerIndex:head!.index})));
    if(stop<0)break;index+=stop+1;
   }
  }
  if(name==="git"){
   let index=0;
   while(args[index]?.startsWith("-")){
    const flag=args[index++]!;
    if(gitValueOptions.has(flag)&&!flag.includes("="))index++;
   }
   const action=args[index],flags=args.slice(index+1);
   const force=flags.some(arg=>/^--force(?:-with-lease|=|$)/.test(arg)||/^-[^-]*f/.test(arg));
   const hard=action==="reset"&&flags.includes("--hard")||action==="clean"&&force||action==="push"&&force;
   const branchDelete=action==="branch"&&(flags.some(arg=>/^-[^-]*D/.test(arg))||force&&flags.some(arg=>arg==="--delete"||/^-[^-]*d/.test(arg)));
   if(hard||branchDelete||["reset","clean","restore","rebase"].includes(action??"")||
    action==="checkout"&&(force||flags.includes("--"))||action==="stash"&&["drop","clear"].includes(flags[0]??""))add("git",hard);
  }
  previous=segment;previousSeparator=tokens[end]?.value??"";start=end+1;
 }
 for(const {body,index} of backtickBodies(command))
  matches.push(...recognize(body,depth+1).map(match=>({...match,triggerIndex:index})));
 return matches;
}

/**
 * Returns immutable lexical evidence of recognizable data-loss forms. It does
 * not parse a complete shell, execute expansions, or decide block/confirm/pass.
 */
export function recognizeDestructiveCommands(command:string):readonly DestructiveCommandMatch[]{
 const data=dataArgumentRanges(command);
 return freezeMatches(recognize(command,0).filter(match=>!data.some(([from,to])=>match.triggerIndex>=from&&match.triggerIndex<to)));
}
