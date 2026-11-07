import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

// No real TUI, provider credentials, or filesystem writes are needed here.
const helperUrl=pathToFileURL(resolve('scripts/t10-git-row-validation.mjs')).href;
const {evaluateGitRow}=await import(helperUrl);
const sha='978c9bf5e3b8';
const project='C:\\Users\\runneradmin\\AppData\\Local\\Temp\\asen-t10-matrix-uJd38r\\project';
function row(path:string){return ' Git master '+sha+' — 0 changed — '+path;}
const inspect=(value:string,options:Record<string,unknown>={})=>evaluateGitRow({row:value,project,width:120,renderedWidth:value.length,platform:'win32',...options});

test('T10 Windows: equivalent case and slash variants of the exact project pass',()=>{
 const changed=project.replaceAll('\\','/').replace('Users','USERS').replace('Temp','TEMP');
 assert.equal(inspect(row(project)).ok,true);
 const result=inspect(row(changed));assert.equal(result.ok,true);assert.equal(result.pathEquivalent,true);
 assert.equal(result.reason,'fits');
});
test('T10 Windows: different project, appended suffix and false prefix are rejected',()=>{
 for(const changed of [project.replace(/project$/u,'other'),project+'-wrong','extra'+project]){
  const result=inspect(row(changed));assert.equal(result.ok,false,changed);assert.equal(result.reason,'path_shape_mismatch');
 }
});
test('T10: true width overflow fails even if path matches',()=>{
 const result=inspect(row(project),{renderedWidth:121});assert.equal(result.ok,false);assert.equal(result.reason,'width_overflow');
});
test('T10: valid ellipsis at narrow widths, incomplete rows and wrong truncation markers',()=>{
 const cut=' Git master '+sha+' — 0 changed …';
 assert.equal(inspect(cut,{width:40,renderedWidth:cut.length}).ok,true);
 assert.equal(inspect(cut.replace('…','.'),{width:40,renderedWidth:cut.length}).ok,false);
 assert.equal(inspect('not a Git row …').ok,false);
 assert.equal(inspect(' Git master '+sha+' — 0 changed — C:\\Users\\runneradmin').ok,false);
});
test('T10: POSIX paths remain case sensitive',()=>{
 const base='/tmp/Asen/project';
 const value=' Git master '+sha+' — 0 changed — /tmp/asen/project';
 const result=evaluateGitRow({row:value,project:base,width:120,renderedWidth:value.length,platform:'linux'});
 assert.equal(result.ok,false);
});

test('T10 Windows: actual 8.3 alias and long form match by directory identity without text equivalence',()=>{
 const alias=project.replace('runneradmin','RUNNER~1');
 const identity=Object.freeze({dev:3n,ino:912345n,birthtimeNs:1000n,isDirectory:()=>true});
 const fsOps={canonicalize:(value:string)=>value,stat:(value:string)=>{
  if(value===project||value===alias)return identity;
  throw Object.assign(new Error('ENOENT'),{code:'ENOENT'});
 }};
 const result=inspect(row(project),{project:alias,fsOps});
 assert.equal(result.ok,true);assert.equal(result.pathEquivalent,true);
 assert.equal(result.diagnostics.pathMatchMethod,'stat-identity');
 assert.notEqual(alias.toLowerCase(),project.toLowerCase());
});

test('T10: different inode, device, birthtime, missing inode or file cannot pass',()=>{
 const alias=project.replace('runneradmin','RUNNER~1');
 const same={dev:3n,ino:912345n,birthtimeNs:1000n,isDirectory:()=>true};
 for(const difference of [
  {ino:912346n},{dev:4n},{birthtimeNs:1001n},{ino:0n},{isDirectory:()=>false}
 ]){
  const other={...same,...difference};
  const fsOps={canonicalize:(value:string)=>value,stat:(value:string)=>value===alias?other:same};
  const result=inspect(row(project),{project:alias,fsOps});
  assert.equal(result.ok,false);
  assert.equal(result.diagnostics.pathMatchMethod,'stat-mismatch');
 }
});

test('T10: unavailable filesystem identity must not accept aliases',()=>{
 const alias=project.replace('runneradmin','RUNNER~1');
 const fsOps={canonicalize:()=>{throw Error('ENOENT');},stat:()=>{throw Error('ENOENT');}};
 const result=inspect(row(project),{project:alias,fsOps});
 assert.equal(result.ok,false);assert.equal(result.diagnostics.pathMatchMethod,'stat-unavailable');
});

test('T10: file identity is not permission to exceed terminal width',()=>{
 const alias=project.replace('runneradmin','RUNNER~1');
 const identity={dev:3n,ino:912345n,birthtimeNs:1000n,isDirectory:()=>true};
 const fsOps={canonicalize:(value:string)=>value,stat:()=>identity};
 const result=inspect(row(project),{project:alias,fsOps,renderedWidth:121});
 assert.equal(result.pathEquivalent,true);assert.equal(result.ok,false);
 assert.equal(result.reason,'width_overflow');
});
