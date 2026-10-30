import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {accessSync,constants,mkdtempSync,lstatSync,realpathSync,readdirSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,relative,resolve} from "node:path";
import {disposeReviewView,materializeReviewView,readReviewViewFile,revalidateReviewView,type ReviewView} from "../src/review/review-view.js";
import type {CandidateGitTreeManifest} from "../src/review/review-tree-inspection.js";

function diagnostic(message:string,details:Record<string,unknown>):void{
 const sanitize=(value:unknown):unknown=>{
  if(typeof value==="string")return value.replaceAll(realpathSync("."),"<project>").replaceAll(realpathSync(tmpdir()),"<temp>")
   .replaceAll(process.env.USERNAME??"\u0000","<current-user>").replace(/\b[A-Za-z0-9._-]+\\[A-Za-z0-9.$_-]+\b/gu,"<principal>");
  if(Array.isArray(value))return value.map(sanitize);
  if(typeof value==="object"&&value!==null)return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,sanitize(item)]));
  return value;
 };
 console.log(`T05_WINDOWS_VIEW_DIAGNOSTIC ${JSON.stringify(sanitize({message,...details}))}`);
}
function acl(path:string):{status:number;stdout:string;stderr:string}{
 try{
  const stdout=execFileSync("icacls",[path],{encoding:"utf8",stdio:["ignore","pipe","pipe"],windowsHide:true,timeout:10_000});
  const user=process.env.USERNAME;
  return {status:0,stdout:(user?stdout.replaceAll(user,"<current-user>"):stdout).replaceAll(path,"<path>"),stderr:""};
 }catch(error){
  const e=error as NodeJS.ErrnoException & {status?:number;stdout?:Buffer|string;stderr?:Buffer|string};
  const clean=(value:Buffer|string|undefined)=>String(value??"").replaceAll(path,"<path>").replaceAll(process.env.USERNAME??"\u0000","<current-user>");
  return {status:e.status??-1,stdout:clean(e.stdout),stderr:clean(e.stderr)};
 }
}
function manifest(repositoryRoot:string):CandidateGitTreeManifest{
 const bytes=Buffer.from("t05 windows acl diagnostic\n");
 return {schemaVersion:1,repositoryRoot,gitDirectory:repositoryRoot,objectFormat:"sha1",treeIdentity:"a".repeat(40),treeSize:bytes.length,
  treeSha256:createHash("sha256").update(bytes).digest("hex"),entries:[{path:"src/file.txt",kind:"regular",mode:"100644",objectId:"b".repeat(40),
   size:bytes.length,contentSha256:createHash("sha256").update(bytes).digest("hex"),bytesBase64:bytes.toString("base64")}]};
}
function newViewSnapshot(parent:string,before:Set<string>):Array<Record<string,unknown>>{
 return readdirSync(parent).filter(name=>!before.has(name)&&name.startsWith("asen-review-view-")).map(name=>{
  const path=join(parent,name),info=lstatSync(path,{throwIfNoEntry:false});
  return {name,exists:Boolean(info),directory:info?.isDirectory()??false,symlink:info?.isSymbolicLink()??false,
   dev:info?.dev??null,ino:info?.ino??null,acl:info?acl(path):null};
 });
}

test("T05 Windows ACL/view/lifetime single diagnostic",{skip:process.platform!=="win32"?"Windows-only controlled ACL diagnostic":false},t=>{
 const project=realpathSync("."),parent=resolve(project,".cache");
 try{
  if(!lstatSync(parent,{throwIfNoEntry:false})){t.skip("the pre-existing project .cache directory is required; the diagnostic never creates or changes it");return;}
  const parentInfo=lstatSync(parent);
  assert.ok(parentInfo.isDirectory()&&!parentInfo.isSymbolicLink(),"authorized .cache parent must be an ordinary directory");
  assert.equal(realpathSync(parent),parent,"authorized .cache parent must be canonical");
  accessSync(parent,constants.W_OK);

  const before=new Set(readdirSync(parent));
  const fixture=realpathSync(mkdtempSync(join(tmpdir(),"asen-t05-windows-candidate-")));
  let view:ReviewView|undefined;
  let phase="materialize";
  let primaryError:unknown;
  try{
   const candidate=manifest(fixture);
   diagnostic("parent-acl-before",{relativeParent:relative(project,parent),acl:acl(parent)});
   view=materializeReviewView(candidate,parent);
   const root=view.root,info=lstatSync(root);
   diagnostic("materialized",{relativeView:relative(project,root),rootDev:info.dev,rootIno:info.ino,entryCount:view.entryCount,acl:acl(root)});
   phase="read";
   assert.equal(readReviewViewFile(view,"src/file.txt").toString(),"t05 windows acl diagnostic\n");
   phase="revalidate";
   assert.equal(revalidateReviewView(view,candidate),view);
   phase="dispose";
   disposeReviewView(view);
   assert.throws(()=>lstatSync(root),{code:"ENOENT"});
   diagnostic("disposed",{relativeView:relative(project,root),viewRootAbsent:true,parentEntriesAfter:readdirSync(parent).filter(name=>!before.has(name))});
  }catch(error){
   primaryError=error;
   diagnostic("failed",{phase,error:error instanceof Error?`${error.name}: ${error.message}`:String(error),newParentEntries:readdirSync(parent).filter(name=>!before.has(name)),newViewSnapshots:newViewSnapshot(parent,before)});
   throw error;
  }finally{
   if(view){
    const root=view.root,info=lstatSync(root,{throwIfNoEntry:false});
    if(info&&info.isDirectory()&&!info.isSymbolicLink()&&info.dev===view.rootDev&&info.ino===view.rootIno){
     diagnostic("diagnostic-cleanup-pending",{relativeView:relative(project,root),reason:"view remains after normal disposal; no recursive cleanup attempted",primaryFailure:primaryError instanceof Error?primaryError.message:null});
    }
   }
   rmSync(fixture,{recursive:true,force:true});
  }
 }catch(error){
  if(error instanceof Error)assert.fail(`Windows review-view diagnostic failed closed: ${error.message}`);
  throw error;
 }
});
