/** Ajustes aislados de compatibilidad NVIDIA para revisores Pi.
 * Solo modelos fijados y opciones de transporte; no escribe claves ni precios.
 * Pi admite modelOverrides para ajustar metadatos de modelos incluidos.
 */
import assert from "node:assert/strict";
import {mkdirSync,writeFileSync,existsSync} from "node:fs";
import {join,isAbsolute} from "node:path";
import {pathToFileURL} from "node:url";

const modelos=["nvidia/nemotron-3.5-bolt-e4b",
 "nvidia/nemotron-3.5-super-vl-120b-a12b"];
export function configuracionT06Nvidia(){
 const overrides={};
 for(const id of modelos){
  overrides[id]={reasoning:false,maxTokens:1200,
   compat:{supportsReasoningEffort:false,
    maxTokensField:"max_tokens",supportsUsageInStreaming:false}};
 }
 return {providers:{nvidia:{modelOverrides:overrides}}};
}
export function guardarCompatibilidadT06(dir){
 assert.ok(typeof dir==="string"&&isAbsolute(dir),"Directorio Pi no absoluto");
 assert.ok(dir.includes("asen-t06-revision-pi"),"Carpeta Pi inesperada");
 mkdirSync(dir,{recursive:true,mode:0o700});
 const path=join(dir,"models.json");
 assert.equal(existsSync(path),false,"Configuración previa no permitida");
 const content=JSON.stringify(configuracionT06Nvidia(),null,2)+"\n";
 writeFileSync(path,content,{mode:0o600,flag:"wx"});
 return {modelosConfigurados:modelos.length,sinClaves:true,reintentosNuevos:0};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{process.stdout.write(JSON.stringify(guardarCompatibilidadT06(process.env.PI_CODING_AGENT_DIR))+"\n");}
 catch{process.stderr.write("Compatibilidad NVIDIA no instalada\n");process.exitCode=1;}
}
