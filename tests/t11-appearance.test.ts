import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,mkdirSync,readFileSync,rmSync,symlinkSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {readAsenAppearance,saveAsenAppearance,parseAsenAppearance,isAsenAppearancePreset} from "../src/runtime/ui/t11-appearance.js";
test("T11 guarda y recupera Light Neutral Power sin cambiar permisos",t=>{
 const root=mkdtempSync(join(tmpdir(),"asen-t11-a-"));t.after(()=>rmSync(root,{recursive:true,force:true}));
 assert.deepEqual(readAsenAppearance(root),{preset:"neutral",source:"default"});
 for(const p of ["light","neutral","power"] as const){saveAsenAppearance(root,p);assert.deepEqual(readAsenAppearance(root),{preset:p,source:"saved"});}
 assert.deepEqual(JSON.parse(readFileSync(join(root,".asen","t11-appearance.json"),"utf8")),{schema:1,preset:"power"});
});
test("T11 rechaza esquema corrupto y datos de autorización disfrazados",t=>{
 const root=mkdtempSync(join(tmpdir(),"asen-t11-b-"));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const dir=join(root,".asen");mkdirSync(dir);
 for(const s of ["{","{}",'{"schema":2,"preset":"light"}','{"schema":1,"preset":"power","permission":"super-yolo"}']){
  writeFileSync(join(dir,"t11-appearance.json"),s);
  assert.deepEqual(readAsenAppearance(root),{preset:"neutral",source:"invalid"});
 }
 assert.equal(parseAsenAppearance({schema:1,preset:"light"}),"light");
 assert.equal(parseAsenAppearance({schema:1,preset:"light",model:"hidden"}),undefined);
 assert.equal(isAsenAppearancePreset("auto"),false);
 assert.throws(()=>saveAsenAppearance(root,"auto" as never),/Invalid/);
});
test("T11 no sigue enlaces a archivos ajenos",t=>{
 const root=mkdtempSync(join(tmpdir(),"asen-t11-c-"));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const dir=join(root,".asen");mkdirSync(dir);
 const outside=join(root,"outside"),inside=join(dir,"t11-appearance.json");
 writeFileSync(outside,"sin cambios");
 try{symlinkSync(outside,inside,"file");}catch(err){if(process.platform==="win32"&&(err as NodeJS.ErrnoException).code==="EPERM"){t.skip("Sin permiso para symlink");return;}throw err;}
 assert.equal(readAsenAppearance(root).source,"invalid");
 assert.throws(()=>saveAsenAppearance(root,"light"),/Unsafe/);
 assert.equal(readFileSync(outside,"utf8"),"sin cambios");
});
