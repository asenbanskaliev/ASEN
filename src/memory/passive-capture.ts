const learningHeader=/^#{2,3}\s+(?:Aprendizajes(?:\s+Clave)?|Key\s+Learnings?|Learnings?):?\s*$/i;
export function extractKeyLearnings(text:string):string[]{
 const lines=text.split(/\r?\n/),sections:string[][]=[];
 for(let i=0;i<lines.length;i++)if(learningHeader.test(lines[i]!)){const part:string[]=[];for(i++;i<lines.length&&!/^#{1,3}\s/.test(lines[i]!);i++)part.push(lines[i]!);sections.push(part);i--;}
 for(let s=sections.length-1;s>=0;s--){const numbered=items(sections[s]!,/^\s*\d+[.)]\s+(.+)$/),chosen=numbered.length?numbered:items(sections[s]!,/^\s*[-*+]\s+(.+)$/);if(chosen.length)return chosen;}return [];
}
function items(lines:string[],pattern:RegExp):string[]{return lines.flatMap(line=>{const m=pattern.exec(line);if(!m)return[];const v=m[1]!.replace(/\*\*(.*?)\*\*/g,"$1").replace(/\`([^\`]+)\`/g,"$1").replace(/\*(.*?)\*/g,"$1").replace(/\s+/g," ").trim();return Buffer.byteLength(v,"utf8")>=20&&v.split(/\s+/).length>=4?[v]:[];});}
