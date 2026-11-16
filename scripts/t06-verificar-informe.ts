/** Comprobación read-only del informe T06. No ejecuta modelos ni código generado. */
import {lstatSync,readFileSync} from "node:fs";
import {resolve} from "node:path";
import {verifyT06NativeSnapshot} from "../src/runtime/agents/t06-native-snapshot-verifier.js";

const [, ,reportPath,rootA,rootB,...extra]=process.argv;
if(!reportPath||!rootA||!rootB||extra.length){
 console.error("Uso: npx tsx scripts/t06-verificar-informe.ts <informe.json> <worktree-A> <worktree-B>");
 process.exitCode=2;
}else{
 try{
  const path=resolve(reportPath);
  if(!lstatSync(path).isFile()||lstatSync(path).isSymbolicLink())
   throw new Error("Informe no válido");
  const bytes=readFileSync(path);
  if(bytes.length<10||bytes.length>1024*1024)throw new Error("Informe no válido");
  const report:unknown=JSON.parse(bytes.toString("utf8"));
  const result=verifyT06NativeSnapshot({report,worktreeRoots:[rootA,rootB]});
  process.stdout.write(JSON.stringify(result,null,2)+"\n");
  if(result.status==="blocked")process.exitCode=1;
 }catch{
  console.error("No se pudo leer/verificar el informe T06. No hay aprobación implícita.");
  process.exitCode=1;
 }
}
