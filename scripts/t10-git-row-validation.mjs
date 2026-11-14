import {realpathSync,statSync} from 'node:fs';
import {posix,win32} from 'node:path';

function normalizedPath(value,platform){
 if(platform==='win32')return win32.normalize(value.replace(/\//gu,'\\')).toLowerCase();
 return posix.normalize(value);
}
// Filesystem identity is ONLY a display check. Windows 8.3 short names and
// long names can identify one directory while realpath text remains different.
export function sameDirectoryStats(left,right){
 return Boolean(left?.isDirectory?.() && right?.isDirectory?.()
  && typeof left.dev==='bigint' && typeof right.dev==='bigint'
  && typeof left.ino==='bigint' && typeof right.ino==='bigint'
  && left.ino!==0n && right.ino!==0n
  && typeof left.birthtimeNs==='bigint' && typeof right.birthtimeNs==='bigint'
  && left.dev===right.dev && left.ino===right.ino
  && left.birthtimeNs===right.birthtimeNs);
}
function equivalentPath(observed,expected,platform,{canonicalize=realpathSync.native,stat=statSync}={}){
 if(normalizedPath(observed,platform)===normalizedPath(expected,platform))return {equivalent:true,method:'text'};
 try{
  if(normalizedPath(canonicalize(observed),platform)===normalizedPath(canonicalize(expected),platform)){
   return {equivalent:true,method:'native-realpath'};
  }
 }catch{/* Identity may still be proven from file metadata. */}
 try{
  const left=stat(observed,{bigint:true}),right=stat(expected,{bigint:true});
  if(sameDirectoryStats(left,right))return {equivalent:true,method:'stat-identity'};
  return {equivalent:false,method:'stat-mismatch'};
 }catch{return {equivalent:false,method:'stat-unavailable'};}
}
function mismatchAt(left,right){
 const length=Math.min(left.length,right.length);
 for(let i=0;i<length;i++)if(left[i]!==right[i])return i;
 return left.length===right.length?-1:length;
}
/** Validate the display of the real Pi Git row, never repository identity or authority. */
export function evaluateGitRow({row,project,width,renderedWidth,platform=process.platform,fsOps}){
 const tail=row.trimEnd(),isGit=tail.trimStart().startsWith('Git '),truncated=tail.endsWith('…');
 const match=/^\s*Git .+? [0-9a-f]{12} — [0-9]+ changed — (.+)$/u.exec(tail);
 const shown=match?.[1]??null;
 const comparison=shown!==null&&!truncated?equivalentPath(shown,project,platform,fsOps):{equivalent:false,method:'not-full-path'};
 const pathEquivalent=comparison.equivalent;
 const widthOkay=renderedWidth<=width;
 const ok=isGit&&widthOkay&&(truncated||pathEquivalent);
 const expectedNorm=normalizedPath(project,platform),shownNorm=shown===null?null:normalizedPath(shown,platform);
 const at=shownNorm===null?null:mismatchAt(shownNorm,expectedNorm);
 return {
  ok,pathEquivalent,reason:!isGit?'not_git_row':!widthOkay?'width_overflow':ok?'fits':'path_shape_mismatch',
  renderedWidth,terminalWidth:width,
  diagnostics:{truncated,pathMatchMethod:comparison.method,observedPathLength:shown?.length??null,expectedPathLength:project.length,
   normalizedObservedLength:shownNorm?.length??null,normalizedExpectedLength:expectedNorm.length,
   firstDifferenceIndex:at,
   observedCharacter:at!==null&&at>=0?shownNorm?.codePointAt(at)?.toString(16)??null:null,
   expectedCharacter:at!==null&&at>=0?expectedNorm.codePointAt(at)?.toString(16)??null:null}
 };
}
