/*
 * Portions derived from gentle-pi's normal-mode command guard.
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
import {recognizeDestructiveCommands,type DestructionKind} from "./destructive-command-guard.js";
import {dataArgumentRanges,type ShellDataRange} from "./shell-command-syntax.js";

export type NormalShellAction="pass"|"deny"|"confirm";
export type GuardedCommandKey="gitPush"|"gitRebase"|"gitBranchDeleteForce"|"npmPublish"|"piRemove";

export interface NormalShellDecision{
 readonly action:NormalShellAction;
 readonly triggerIndex:number;
 readonly title?:string;
 readonly preview?:string;
 readonly guardedKey?:GuardedCommandKey;
 readonly dataLossKind?:DestructionKind;
}

interface GuardedMatch{readonly key:GuardedCommandKey;readonly triggerIndex:number}
const gitGlobalFlags=String.raw`(?:\s+--?\S+(?:\s+[^-\s]\S*)?)*\s+`;
const segment=String.raw`[^\r\n;&|]*`,flagEnd=String.raw`(?=[\s;&|]|$)`;
const forcedBranchDelete=new RegExp(String.raw`\bgit${gitGlobalFlags}(branch)\b(?:`+
 String.raw`(?=${segment}\s-[a-zA-Z]*D[a-zA-Z]*${flagEnd})|`+
 String.raw`(?=${segment}\s(?:--delete\b|-[a-zA-Z]*d[a-zA-Z]*${flagEnd}))(?=${segment}\s(?:--force(?:-with-lease)?(?:=\S*)?${flagEnd}|-[a-zA-Z]*f[a-zA-Z]*${flagEnd})))`);
const guardedPatterns:Readonly<Record<GuardedCommandKey,RegExp>>={
 gitPush:new RegExp(String.raw`\bgit${gitGlobalFlags}(push)\b`),
 gitRebase:new RegExp(String.raw`\bgit${gitGlobalFlags}(rebase)\b`),
 gitBranchDeleteForce:forcedBranchDelete,
 npmPublish:/\bnpm\s+(publish)\b/,
 piRemove:/\bpi\s+(remove)\b/,
};
const labels:Readonly<Record<GuardedCommandKey,string>>={
 gitPush:"Git push",gitRebase:"Git rebase",gitBranchDeleteForce:"forced Git branch deletion",
 npmPublish:"npm publish",piRemove:"Pi package removal",
};
const lexicalDenials=[/\bchmod\s+-R\s+777\b/,/\bchown\s+-R\b/] as const;

const inData=(ranges:readonly ShellDataRange[],index:number)=>ranges.some(([from,to])=>index>=from&&index<to);
function guardedMatches(command:string,ranges:readonly ShellDataRange[]):readonly GuardedMatch[]{
 const matches:GuardedMatch[]=[];
 for(const [key,pattern] of Object.entries(guardedPatterns) as [GuardedCommandKey,RegExp][]){
  const global=new RegExp(pattern.source,`${pattern.flags.replace("g","")}g`);
  for(const match of command.matchAll(global)){
   if(inData(ranges,match.index))continue;
   matches.push({key,triggerIndex:match.index+match[0].lastIndexOf(match[1]??match[0])});
  }
 }
 return matches.sort((left,right)=>left.triggerIndex-right.triggerIndex);
}
function firstLexicalDenial(command:string,ranges:readonly ShellDataRange[]):number|undefined{
 for(const pattern of lexicalDenials){
  const match=[...command.matchAll(new RegExp(pattern.source,`${pattern.flags}g`))].find(item=>!inData(ranges,item.index));
  if(match)return match.index;
 }
 return undefined;
}
function truncatePreview(value:string,width:number):string{
 const characters=Array.from(value);
 return characters.length<=width?value:`${characters.slice(0,Math.max(0,width-1)).join("")}…`;
}

/** Raw-command context: up to 60 source characters before the trigger and 180 visible characters overall. */
export function normalShellCommandPreview(command:string,triggerIndex:number):string{
 const start=Math.max(0,triggerIndex-60),prefix=start>0?"…":"";
 const normalized=command.slice(start).replace(/\s+/g," ").trim();
 return `${prefix}${truncatePreview(normalized,180-Array.from(prefix).length)}`;
}

function titleFor(matches:readonly GuardedMatch[],selected:GuardedMatch):string{
 if(matches.length>1)return `Confirm guarded actions: ${matches.map(match=>labels[match.key]).join("; ")}?`;
 return `Confirm ${labels[selected.key]}?`;
}
function decision(command:string,value:Omit<NormalShellDecision,"preview">):NormalShellDecision{
 return Object.freeze(value.action==="pass"?value:{...value,preview:normalShellCommandPreview(command,value.triggerIndex)});
}

/**
 * Pure installed-reference normal-mode classification of the raw model command.
 * This is lexical admission evidence, not shell confinement or runtime wiring.
 */
export function classifyNormalShellCommand(command:string):NormalShellDecision{
 const ranges=dataArgumentRanges(command),guarded=guardedMatches(command,ranges);
 const destructive=recognizeDestructiveCommands(command),hard=destructive.find(match=>match.hardDeny);
 if(hard)return decision(command,{action:"deny",title:"Shell command denied",triggerIndex:hard.triggerIndex,dataLossKind:hard.kind});
 const forcedBranch=guarded.find(match=>match.key==="gitBranchDeleteForce");
 if(forcedBranch)return decision(command,{action:"deny",title:"Shell command denied",guardedKey:forcedBranch.key,triggerIndex:forcedBranch.triggerIndex,dataLossKind:"git"});
 const lexical=firstLexicalDenial(command,ranges);
 if(lexical!==undefined)return decision(command,{action:"deny",title:"Shell command denied",triggerIndex:lexical});
 const dataLoss=destructive.find(match=>match.kind!=="git");
 if(dataLoss)return decision(command,{action:"confirm",title:"Confirm recognized data-loss command?",triggerIndex:dataLoss.triggerIndex,dataLossKind:dataLoss.kind});
 const selected=guarded[0];
 if(selected)return decision(command,{action:"confirm",title:titleFor(guarded,selected),guardedKey:selected.key,triggerIndex:selected.triggerIndex});
 return Object.freeze({action:"pass",triggerIndex:0});
}
