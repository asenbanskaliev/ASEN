/*
 * Portions derived from gentle-pi's destructive command syntax helpers.
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

/** A lexical shell token. `index` is a zero-based UTF-16 offset into the input. */
export interface ShellToken {
 readonly value:string;
 readonly raw:string;
 readonly operator:boolean;
 readonly index:number;
}

/** A half-open UTF-16 source range: `[from,to)`. */
export type ShellDataRange=readonly [from:number,to:number];

const separators=new Set([";","&&","||","|","&","\n","(",")"]);
const wrapperValueOptions:Readonly<Record<string,readonly string[]>>={
 env:["-u","--unset","-C","--chdir"],
 sudo:["-u","-g","-h","-p","-C","--user","--group","--host","--prompt","--chdir"],
 timeout:["-s","--signal","-k","--kill-after"],
 xargs:["-n","-I","-P","--max-args","--replace","--max-procs"],
};
const wrappers=new Set(["env","sudo","command","exec","nohup","timeout","xargs"]);
const reservedWords=new Set(["then","else","elif","do","{","!","if","while","until"]);
const dataCommands=new Set([
 "grep","egrep","fgrep","rg","ag","ack","echo","printf","cat","head","tail","less","more",
 "wc","sort","uniq","cut","tr","jq","diff","ls","file","stat",
]);
const inertCommands=new Set(["cd","pwd","true","false","test","[","mkdir","touch"]);
const heredocPattern=/<<-?\s*(['"]?)([A-Za-z_]\w*)\1[^\n]*\n[\s\S]*?\n\2(?=\n|$)/g;
const simpleSubstitutionPattern=/\$\(([^()'"`$\\]*)\)/g;
const assignmentPattern=/^[A-Za-z_][A-Za-z_0-9]*=/;

const executable=(value:string)=>value.split("/").at(-1)??value;
const freezeTokens=(tokens:ShellToken[])=>Object.freeze(tokens.map(token=>Object.freeze(token)));
const freezeRanges=(ranges:ShellDataRange[])=>Object.freeze(ranges.map(range=>Object.freeze([...range]) as ShellDataRange));

/** Blanks literal named heredoc bodies without changing string length or offsets. */
function blankHeredocs(command:string):string{
 return command.replace(heredocPattern,raw=>{
  const headerLength=raw.indexOf("\n")+1;
  return raw.slice(0,headerLength)+" ".repeat(raw.length-headerLength);
 });
}

function tokenize(command:string,blank=true):readonly ShellToken[]{
 const tokens:ShellToken[]=[];
 const source=blank?blankHeredocs(command):command;
 const pattern=/(?:(?:"(?:\\.|[^"\\])*"|'[^']*'|\\.|[^\s;&|()'"\\])+)|&&|\|\||[;&|()\n]/g;
 for(const match of source.matchAll(pattern)){
  const raw=match[0];
  const value=raw.replace(/"((?:\\.|[^"\\])*)"|'([^']*)'|\\(.)/g,
   (_raw,double:string|undefined,single:string|undefined,escaped:string|undefined)=>{
    if(double!==undefined)return double.replace(/\\(["\\$`\n])/g,(_escape,char:string)=>char==="\n"?"":char);
    return single??escaped??"";
   });
  tokens.push({value,raw,operator:separators.has(raw),index:match.index});
 }
 return freezeTokens(tokens);
}

/**
 * Tokenizes only lexical words and shell boundaries needed by the later guard.
 * Quoted or escaped boundaries remain words. The input is never modified and
 * the returned array and token records are frozen.
 */
export function tokenizeShellCommand(command:string):readonly ShellToken[]{return tokenize(command);}

/**
 * Returns the candidate executable position after known reserved words,
 * assignments and wrappers. It does not execute expansions or validate a full
 * shell grammar, and never mutates `segment`.
 */
export function shellCommandHeadIndex(segment:readonly ShellToken[]):number{
 let cursor=0;
 while(cursor<segment.length){
  const token=segment[cursor];
  if(!token||token.raw!==token.value||!reservedWords.has(token.value))break;
  cursor++;
 }
 while(cursor<segment.length){
  const token=segment[cursor];
  if(!token)break;
  if(assignmentPattern.test(token.value)){cursor++;continue;}
  const name=executable(token.value);
  if(!wrappers.has(name))break;
  cursor++;
  while(cursor<segment.length){
   const option=segment[cursor];
   if(!option?.value.startsWith("-"))break;
   cursor++;
   if(option.value==="--")break;
   if(wrapperValueOptions[name]?.includes(option.value))cursor++;
  }
  if(name==="timeout")cursor++;
 }
 return cursor;
}

function maskDataSubstitutions(command:string):{masked:string;ranges:ShellDataRange[]}|undefined{
 if(!command.includes("$("))return {masked:command,ranges:[]};
 if(command.includes("<<"))return undefined;
 const ranges:ShellDataRange[]=[];
 let opaque=false;
 const masked=command.replace(simpleSubstitutionPattern,(raw:string,body:string,offset:number)=>{
  const inner=dataRanges(body);
  if(inner===undefined)opaque=true;
  else for(const [from,to] of inner)ranges.push([offset+2+from,offset+2+to]);
  return "_".repeat(raw.length);
 });
 return opaque||masked.includes("$(")?undefined:{masked,ranges};
}

/** Undefined means opaque; an empty list means only inert commands. */
function dataRanges(original:string):ShellDataRange[]|undefined{
 const substitutions=maskDataSubstitutions(original);
 if(!substitutions)return undefined;
 const command=substitutions.masked;
 if(/`|[<>]\(/.test(command))return undefined;
 const unblankedTokens=tokenize(command,false);
 const rawHeredocStarts=new Set(unblankedTokens.filter(token=>token.raw.startsWith("<<")).map(token=>token.index));
 const heredocs=[...command.matchAll(heredocPattern)];
 if(heredocs.some(heredoc=>!rawHeredocStarts.has(heredoc.index)))return undefined;
 const blanked=blankHeredocs(command),tokens=tokenize(command),covered=new Uint8Array(blanked.length);
 for(const token of tokens)covered.fill(1,token.index,token.index+token.raw.length);
 for(let index=0;index<blanked.length;index++)if(!covered[index]&&!/\s/.test(blanked[index]??""))return undefined;
 const ranges=[...substitutions.ranges];
 let start=0;
 for(let end=0;end<=tokens.length;end++){
  const boundary=tokens[end];
  if(boundary&&!boundary.operator)continue;
  const segment=tokens.slice(start,end);start=end+1;
  if(segment.length===0)continue;
  let cursor=0;
  if(segment[0]?.value==="env")cursor++;
  while(cursor<segment.length&&assignmentPattern.test(segment[cursor]?.value??""))cursor++;
  const head=segment[cursor];
  if(!head&&cursor>0&&segment[0]?.value!=="env")continue;
  if(!head||head.value!==head.raw)return undefined;
  if(inertCommands.has(head.value))continue;
  if(!dataCommands.has(head.value))return undefined;
  ranges.push([head.index+head.raw.length,boundary?.index??command.length]);
 }
 for(const heredoc of heredocs){
  const heredocIndex=heredoc.index;
  if(heredocIndex===undefined)continue;
  const bodyStart=heredocIndex+heredoc[0].indexOf("\n")+1;
  if(ranges.some(([from,to])=>heredocIndex>=from&&heredocIndex<to))ranges.push([bodyStart,heredocIndex+heredoc[0].length]);
 }
 return ranges;
}

/**
 * Returns only argument ranges that are provably data for known search/display
 * commands. If any segment is opaque (unknown executor, wrapper, compound word,
 * backtick, process substitution, unsafe substitution, or malformed quoting),
 * no exemptions are returned. This is lexical evidence, never a safety verdict.
 */
export function dataArgumentRanges(command:string):readonly ShellDataRange[]{
 return freezeRanges(dataRanges(command)??[]);
}
