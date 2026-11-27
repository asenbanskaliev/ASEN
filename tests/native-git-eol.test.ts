import assert from "node:assert/strict";
import test from "node:test";
import {execFileSync} from "node:child_process";
import {mkdtempSync,writeFileSync,realpathSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {isolatedGitEnvironment} from "../src/runtime/agents/git-isolated-environment.js";
import {captureWorkspaceReviewProjection} from "../src/review/workspace-review-projection.js";

test("La proyección nativa normaliza CRLF de adiciones autorizadas y finales mixtos sin alterar revisión ordinaria",()=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),"asen-eol-")));
 const git=(...args:string[])=>execFileSync("git",["-C",root,...args],{env:isolatedGitEnvironment(),stdio:["ignore","pipe","pipe"]});
 try{
  git("init","-q");git("config","user.name","ASEN");git("config","user.email","test@example.invalid");git("config","core.autocrlf","false");
  writeFileSync(join(root,".gitattributes"),"*.txt text eol=crlf\nespecial.txt filter=sin-configurar\n*.bin -text\n");
  writeFileSync(join(root,".gitignore"),"ignorado.txt\n");
  writeFileSync(join(root,"existente.txt"),"base\nsegunda\n");
  git("add",".");git("commit","--no-gpg-sign","-qm","base");
  const inputs=new Map<string,Buffer>([
   ["existente.txt",Buffer.from("cambio\r\nsegunda\n")],
   ["nuevo.txt",Buffer.from("uno\r\ndos\r\n")],
   ["ignorado.txt",Buffer.from("tres\r\ncuatro\r\n")],
   ["especial.txt",Buffer.from("filtro\r\n")],
   ["binario.bin",Buffer.from([0,13,10,255])]
  ]);
  for(const [path,bytes] of inputs)writeFileSync(join(root,path),bytes);
  const paths=[...inputs.keys()],request={repositoryRoot:root,intendedUntracked:paths.filter(path=>path!=="existente.txt")};
  const ordinary=captureWorkspaceReviewProjection(request,paths);
  for(const [path,bytes] of inputs)assert.deepEqual(git("show",ordinary.candidateTree+":"+path),bytes);
  const native=captureWorkspaceReviewProjection(request,paths,undefined,true);
  for(const [path,bytes] of inputs){
   const expected=["existente.txt","nuevo.txt","ignorado.txt"].includes(path)?Buffer.from(bytes.toString("utf8").replace(/\r\n/g,"\n")):bytes;
   assert.deepEqual(git("show",native.candidateTree+":"+path),expected,path);
  }
 }finally{rmSync(root,{recursive:true,force:true});}
});
