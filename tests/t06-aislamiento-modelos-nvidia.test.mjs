import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync,readFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {configuracionT06Nvidia,guardarCompatibilidadT06} from "../scripts/t06-aislamiento-modelos-nvidia.mjs";
test("T06 limita configuración NVIDIA a dos revisores, sin claves ni sustituciones",t=>{
 const root=mkdtempSync(join(tmpdir(),"asen-t06-revision-pi-"));
 t.after(()=>rmSync(root,{recursive:true,force:true}));
 const file=configuracionT06Nvidia();
 assert.deepEqual(file.providers.nvidia.models,[{
  id:"nvidia/nemotron-3-super-120b-a12b",api:"openai-completions",
  reasoning:false,maxTokens:1200
 }]);
 const ids=Object.keys(file.providers.nvidia.modelOverrides);
 assert.deepEqual(ids,["nvidia/nemotron-3-super-120b-a12b","nvidia/nemotron-3.5-super-vl-120b-a12b"]);
 for(const id of ids){
  const entry=file.providers.nvidia.modelOverrides[id];
  assert.equal(entry.reasoning,false);
  assert.equal(entry.compat.maxTokensField,"max_tokens");
  assert.equal(entry.compat.supportsReasoningEffort,false);
 }
 const nuevo=file.providers.nvidia.modelOverrides["nvidia/nemotron-3-super-120b-a12b"];
 assert.equal("samplingParams" in nuevo,false);
 assert.equal("nvidia/nemotron-3.5-bolt-e4b" in file.providers.nvidia.modelOverrides,false);
 assert.equal("samplingParams" in file.providers.nvidia.modelOverrides["nvidia/nemotron-3.5-super-vl-120b-a12b"],false);
 assert.doesNotMatch(JSON.stringify(file),/nvapi|API_KEY|sk-/u);
 const result=guardarCompatibilidadT06(root);
 assert.equal(result.modelosConfigurados,2);
 assert.deepEqual(JSON.parse(readFileSync(join(root,"models.json"),"utf8")),file);
 assert.throws(()=>guardarCompatibilidadT06(root),/Configuración previa/u);
 assert.throws(()=>guardarCompatibilidadT06("/tmp/otro-dir"),/Carpeta Pi inesperada/u);
});
