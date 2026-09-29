export interface SkillIndexMetadata {name:string;description:string}

export type SkillAuditIssueCode=
 |"missing-frontmatter"|"invalid-frontmatter"|"unexpected-frontmatter-field"|"unexpected-metadata-field"
 |"invalid-name"|"name-directory-mismatch"|"invalid-description"|"invalid-section-order"
 |"body-below-target"|"body-above-target"|"body-above-recommended-ceiling"|"body-above-hard-limit"|"forbidden-keywords-section"|"nonlocal-reference";

export interface SkillAuditIssue {code:SkillAuditIssueCode;message:string;line?:number}
export interface SkillAuditResult {metadata:SkillIndexMetadata|null;issues:SkillAuditIssue[];bodyWordCount:number}

const expectedSections=["Activation Contract","Hard Rules","Decision Gates","Execution Steps","Output Contract","References"];
const expectedTop=["name","description","license","metadata"];
const expectedMetadata=["author","version"];
const wordPattern=/[\p{L}\p{N}][\p{L}\p{N}'’/-]*/gu;

interface Frontmatter {lines:string[];body:string;closed:boolean}

function frontmatterOf(text:string):Frontmatter|null {
 const normalized=text.replace(/\r\n?/g,"\n");
 if(!normalized.startsWith("---\n"))return null;
 const end=normalized.indexOf("\n---",4);
 if(end<0)return {lines:normalized.slice(4).split("\n"),body:"",closed:false};
 const after=end+4;
 if(after<normalized.length&&normalized[after]!=="\n")return {lines:normalized.slice(4,end).split("\n"),body:normalized.slice(after),closed:false};
 return {lines:normalized.slice(4,end).split("\n"),body:normalized.slice(after).replace(/^\n/,""),closed:true};
}

function scalar(line:string,key:string):string|null {
 const match=line.match(new RegExp(`^${key}:\\s*(.+)$`));
 if(!match)return null;
 const value=match[1]!.trim();
 if(value.startsWith('"')||value.endsWith('"')){
  if(!value.startsWith('"')||!value.endsWith('"'))return null;
  try{const parsed=JSON.parse(value) as unknown;return typeof parsed==="string"?parsed:null;}catch{return null;}
 }
 if(value.startsWith("'")||value.endsWith("'")){
  if(!value.startsWith("'")||!value.endsWith("'"))return null;
  return value.slice(1,-1).replace(/''/g,"'");
 }
 if(/^[>|](?:[1-9][+-]?|[+-][1-9]?)?$/.test(value)||/^[\[{]/.test(value))return null;
 return value;
}

export function parseSkillIndexMetadata(text:string):SkillIndexMetadata|null {
 const frontmatter=frontmatterOf(text);
 if(!frontmatter?.closed)return null;
 const nameIndexes=frontmatter.lines.flatMap((line,index)=>line.startsWith("name:")?[index]:[]);
 const descriptionIndexes=frontmatter.lines.flatMap((line,index)=>line.startsWith("description:")?[index]:[]);
 if(nameIndexes.length!==1||descriptionIndexes.length!==1)return null;
 const nameLine=frontmatter.lines[nameIndexes[0]!]!,descriptionIndex=descriptionIndexes[0]!,descriptionLine=frontmatter.lines[descriptionIndex]!;
 const name=scalar(nameLine,"name"),description=scalar(descriptionLine,"description");
 const nextTopLevelOffset=frontmatter.lines.slice(descriptionIndex+1).findIndex(line=>/^[A-Za-z][\w-]*:/.test(line));
 const descriptionTail=frontmatter.lines.slice(descriptionIndex+1,nextTopLevelOffset<0?undefined:descriptionIndex+1+nextTopLevelOffset);
 if(!name||!description||descriptionLine.trimEnd()!==descriptionLine||descriptionTail.some(line=>/^\s+\S/.test(line)))return null;
 return {name,description};
}

function lineNumber(lines:string[],line:string):number|undefined {
 const index=lines.indexOf(line);return index<0?undefined:index+2;
}

function isNonlocal(target:string):boolean {
 const clean=target.split(/[?#]/,1)[0]!.replace(/\\/g,"/");
 return /^(?:[a-z]+:|\/|[A-Za-z]:)/i.test(clean)||clean.split("/").includes("..");
}

export function auditSkillDocument(text:string,{directoryName}:{directoryName:string}):SkillAuditResult {
 const normalized=text.replace(/\r\n?/g,"\n"),frontmatter=frontmatterOf(normalized),issues:SkillAuditIssue[]=[];
 const add=(code:SkillAuditIssueCode,message:string,line?:number)=>issues.push(line===undefined?{code,message}:{code,message,line});
 if(!frontmatter){
  add("missing-frontmatter","YAML frontmatter is required");
  return {metadata:null,issues,bodyWordCount:(normalized.match(wordPattern)??[]).length};
 }
 if(!frontmatter.closed)add("invalid-frontmatter","Frontmatter must end with an exact --- delimiter");
 const top:string[]=[],children:string[]=[],hierarchy:string[]=[];
 for(const line of frontmatter.lines){
  const topMatch=line.match(/^([A-Za-z][\w-]*):(?:\s.*)?$/);
  const childMatch=line.match(/^  ([A-Za-z][\w-]*):(?:\s.*)?$/);
  if(topMatch){top.push(topMatch[1]!);hierarchy.push(`top:${topMatch[1]}`);}
  else if(childMatch){children.push(childMatch[1]!);hierarchy.push(`child:${childMatch[1]}`);}
  else add("invalid-frontmatter",`Invalid frontmatter line: ${line}`,lineNumber(frontmatter.lines,line));
 }
 for(const field of top.filter(field=>!expectedTop.includes(field)))add("unexpected-frontmatter-field",`Unexpected frontmatter field: ${field}`);
 for(const field of children.filter(field=>!expectedMetadata.includes(field)))add("unexpected-metadata-field",`Unexpected metadata field: ${field}`);
 const expectedHierarchy=[...expectedTop.map(field=>`top:${field}`),...expectedMetadata.map(field=>`child:${field}`)];
 if(JSON.stringify(hierarchy)!==JSON.stringify(expectedHierarchy))
  add("invalid-frontmatter","Frontmatter fields must be present once in exact order, with metadata children directly under metadata");
 const metadata=parseSkillIndexMetadata(normalized),name=metadata?.name;
 if(!name||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name))add("invalid-name","Skill name must be kebab-case");
 else if(name!==directoryName)add("name-directory-mismatch",`Skill name ${name} must match directory ${directoryName}`);
 const descriptionLine=frontmatter.lines.find(line=>line.startsWith("description:"));
 const description=metadata?.description;
 if(!descriptionLine||!/^description: "(?:[^"\\]|\\.)*"$/.test(descriptionLine)||!description?.startsWith("Trigger:")||description.length>250)
  add("invalid-description","Description must be quoted, one physical line, trigger-first, and at most 250 characters");
 if(frontmatter.lines.find(line=>line.startsWith("license:"))!=="license: Apache-2.0")add("invalid-frontmatter","License must be Apache-2.0");
 const authorLine=frontmatter.lines.find(line=>line.startsWith("  author:"));
 const author=authorLine===undefined?null:scalar(authorLine.slice(2),"author");
 if(!author?.trim())add("invalid-frontmatter","Metadata author must be a nonblank scalar value");
 const versionLine=frontmatter.lines.find(line=>line.startsWith("  version:"));
 const version=versionLine===undefined?null:scalar(versionLine.slice(2),"version");
 if(!version||!/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(version))
  add("invalid-frontmatter","Metadata version must be a semantic major.minor.patch scalar value");
 const headings=[...frontmatter.body.matchAll(/^## (.+)$/gm)].map(match=>match[1]!);
 if(JSON.stringify(headings)!==JSON.stringify(expectedSections))add("invalid-section-order","Use the six exact H2 sections in order");
 if(headings.includes("Keywords"))add("forbidden-keywords-section","Keywords sections are forbidden");
 const bodyWordCount=(frontmatter.body.match(wordPattern)??[]).length;
 if(bodyWordCount<180)add("body-below-target","Body is below the 180-word target");
 if(bodyWordCount>450)add("body-above-target","Body exceeds the 450-word target");
 if(bodyWordCount>700)add("body-above-recommended-ceiling","Body exceeds the 700-word recommended ceiling");
 if(bodyWordCount>1000)add("body-above-hard-limit","Body exceeds the 1000-word hard limit");
 const targets=[...frontmatter.body.matchAll(/\[[^\]]*\]\(([^)]+)\)|`([^`\n]+(?:\.md|\/[^`\n]+))`/g)].map(match=>(match[1]??match[2])!.trim());
 for(const target of targets)if(isNonlocal(target))add("nonlocal-reference",`Reference must remain repository-local: ${target}`);
 if(/https?:\/\//i.test(frontmatter.body)&&!targets.some(target=>/^https?:\/\//i.test(target)))add("nonlocal-reference","External references are forbidden");
 return {metadata,issues,bodyWordCount};
}
