import {realpathSync} from 'node:fs';
import {posix,win32} from 'node:path';

function normalizedPath(value,platform){
 if(platform==='win32')return win32.normalize(value.replace(/\//gu,'\\')).toLowerCase();
 return posix.normalize(value);
}
function equivalentPath(observed,expected,platform){
 if(normalizedPath(observed,platform)===normalizedPath(expected,platform))return true;
 try{return normalizedPath(realpathSync(observed),platform)===normalizedPath(realpathSync(expected),platform);}
 catch{return false;}
}
function mismatchAt(left,right){
 const length=Math.min(left.length,right.length);
 for(let i=0;i<length;i++)if(left[i]!==right[i])return i;
 return left.length===right.length?-1:length;
}
/** Validate the display of the real Pi Git row, never repository identity or authority. */
export function evaluateGitRow({row,project,width,renderedWidth,platform=process.platform}){
 const tail=row.trimEnd(),isGit=tail.trimStart().startsWith('Git '),truncated=tail.endsWith('…');
 const match=/^\s*Git .+? [0-9a-f]{12} — [0-9]+ changed — (.+)$/u.exec(tail);
 const shown=match?.[1]??null;
 const pathEquivalent=shown!==null&&!truncated&&equivalentPath(shown,project,platform);
 const widthOkay=renderedWidth<=width;
 const ok=isGit&&widthOkay&&(truncated||pathEquivalent);
 const expectedNorm=normalizedPath(project,platform),shownNorm=shown===null?null:normalizedPath(shown,platform);
 const at=shownNorm===null?null:mismatchAt(shownNorm,expectedNorm);
 return {
  ok,pathEquivalent,reason:!isGit?'not_git_row':!widthOkay?'width_overflow':ok?'fits':'path_shape_mismatch',
  renderedWidth,terminalWidth:width,
  diagnostics:{truncated,observedPathLength:shown?.length??null,expectedPathLength:project.length,
   normalizedObservedLength:shownNorm?.length??null,normalizedExpectedLength:expectedNorm.length,
   firstDifferenceIndex:at,
   observedCharacter:at!==null&&at>=0?shownNorm?.codePointAt(at)?.toString(16)??null:null,
   expectedCharacter:at!==null&&at>=0?expectedNorm.codePointAt(at)?.toString(16)??null:null}
 };
}
