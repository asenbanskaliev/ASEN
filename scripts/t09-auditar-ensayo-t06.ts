/** T09: lee el informe T06 ya existente SIN usar proveedores ni ejecutar código.
 * La salida es un diagnóstico de evidencia declarada, NO una comparación A/B. */
import {readFileSync,writeFileSync,mkdirSync,lstatSync} from "node:fs";
import {isAbsolute,join} from "node:path";
import {assessT09NativeTrialReadiness} from "../src/review/t09-native-trial-readiness.js";

const sha=process.env.ASEN_T06_EXPECTED_SHA??"";
const dir=process.env.ASEN_T06_WRITER_REPORT_DIR??"";
if(!isAbsolute(dir)||!dir||!process.env.GITHUB_ACTIONS||
 !/^[0-9a-f]{40}$/u.test(sha))throw new Error("T09 requiere un informe T06 de SHA exacto en carpeta absoluta");
mkdirSync(dir,{recursive:true,mode:0o700});
if(!lstatSync(dir).isDirectory()||lstatSync(dir).isSymbolicLink())
 throw new Error("T09 no admite carpetas de evidencia simbólicas");
const source=join(dir,"t06-dual-native-evidence.json");
let report:unknown=null;
try{
 const info=lstatSync(source);
 if(info.isFile()&&!info.isSymbolicLink()&&info.size<=100_000)
  report=JSON.parse(readFileSync(source,"utf8")) as unknown;
}catch{/* Informe ausente, ilegible o corrupto: se bloquea la clasificación. */}
const result=assessT09NativeTrialReadiness({report,expectedSha:sha});
const safe=Object.freeze({
 schema:"asen.t09.native-trial-readiness/v1",
 sha,status:result.status,blockers:result.blockers,
 measurements:result.measurements,
 providerUsageVerified:false,billingVerified:false,
 referenceCompared:false,qualityIndependentlyVerified:false,
 authorized:false,acceptance:"not-accepted",globalFull:false
});
writeFileSync(join(dir,"t09-readiness.json"),JSON.stringify(safe,null,2)+"\n",{
 flag:"wx",mode:0o600
});
console.log(JSON.stringify({status:safe.status,blockers:safe.blockers,
 measurements:safe.measurements,globalFull:false}));
