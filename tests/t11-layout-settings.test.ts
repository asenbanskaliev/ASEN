import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,mkdirSync,readFileSync,rmSync,symlinkSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {readT11Layout,writeT11Layout,parseT11Layout} from "../src/runtime/ui/t11-layout-settings.js";
test("T11: posición y densidad se guardan de forma independiente de los permisos",t=>{
 const home=mkdtempSync(join(tmpdir(),"asen-layout-"));t.after(()=>rmSync(home,{recursive:true,force:true}));
 assert.deepEqual(readT11Layout(home),{position:"auto",density:"comfortable",source:"default"});
 writeT11Layout(home,{position:"bottom",density:"minimal"});
 assert.deepEqual(readT11Layout(home),{position:"bottom",density:"minimal",source:"saved"});
 assert.deepEqual(JSON.parse(readFileSync(join(home,".asen","t11-layout.json"),"utf8")),{
  schema:1,position:"bottom",density:"minimal"
 });
 writeT11Layout(home,{position:"hidden",density:"compact"});
 assert.equal(readT11Layout(home).position,"hidden");
});
test("T11: versión ajena, campos extra, entradas corruptas o permisos falsos se rechazan",t=>{
 const home=mkdtempSync(join(tmpdir(),"asen-layout-invalid-"));t.after(()=>rmSync(home,{recursive:true,force:true}));
 mkdirSync(join(home,".asen"));const file=join(home,".asen","t11-layout.json");
 for(const value of ["{",'{"schema":2,"position":"right","density":"compact"}',
  '{"schema":1,"position":"../../path","density":"minimal"}',
  '{"schema":1,"position":"right","density":"compact","permission":"super-yolo"}']){
  writeFileSync(file,value);
  assert.equal(readT11Layout(home).source,"invalid");
 }
 assert.equal(parseT11Layout({schema:1,position:"auto",density:"minimal"})?.density,"minimal");
 assert.throws(()=>writeT11Layout(home,{position:"super-yolo",density:"compact"} as never),/Invalid/);
});
test("T11: no se sigue un enlace simbólico a otro archivo",t=>{
 const home=mkdtempSync(join(tmpdir(),"asen-layout-link-"));t.after(()=>rmSync(home,{recursive:true,force:true}));
 mkdirSync(join(home,".asen"));const outside=join(home,"otro"),file=join(home,".asen","t11-layout.json");
 writeFileSync(outside,"intacto");
 try{symlinkSync(outside,file,"file");}catch(error){
  if(process.platform==="win32"&&(error as NodeJS.ErrnoException).code==="EPERM"){t.skip("Windows sin permiso para enlaces");return;}
  throw error;
 }
 assert.equal(readT11Layout(home).source,"invalid");
 assert.throws(()=>writeT11Layout(home,{position:"right",density:"compact"}),/Unsafe/);
 assert.equal(readFileSync(outside,"utf8"),"intacto");
});
