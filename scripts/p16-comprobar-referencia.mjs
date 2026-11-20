/** P16: contrasta las fuentes, no inventa la comparativa A/B.
 * ASEN y Gentle Shell tienen que estar fijados por SHA y sin cambios.
 * Dieciocho ejecuciones autenticadas siguen siendo obligatorias para cerrar 16.
 */
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {readFileSync,mkdirSync,writeFileSync,realpathSync,lstatSync} from "node:fs";
import {join,resolve} from "node:path";
const referenceSha="ce64a9a708e50c0ca899c8023140e63f29f293e1";
export function comprobarReferenciaP16({asenRoot,referenceRoot,expectedAsenSha}){
 const git=(root)=>execFileSync("git",["-C",root,"rev-parse","HEAD"],{encoding:"utf8",timeout:10_000}).trim();
 const state=(root)=>execFileSync("git",["-C",root,"status","--porcelain=v1","--untracked-files=all"],{encoding:"utf8",timeout:10_000}).trim();
 assert.match(expectedAsenSha,/^[a-f0-9]{40}$/u);
 const asen=realpathSync(asenRoot),reference=realpathSync(referenceRoot);
 assert.equal(git(asen),expectedAsenSha,"SHA de ASEN no coincide");
 assert.equal(git(reference),referenceSha,"La referencia Gentle no coincide");
 assert.equal(state(asen),"","ASEN alterado");
 assert.equal(state(reference),"","Gentle alterado");
 const asenPackage=JSON.parse(readFileSync(join(asen,"package.json"),"utf8"));
 const gentlePackage=JSON.parse(readFileSync(join(reference,"package.json"),"utf8"));
 assert.equal(asenPackage.name,"asen");
 assert.equal(gentlePackage.name,"gentle-pi");
 assert.equal(gentlePackage.version,"4.9.0");
 for(const file of ["lib/agents-runner.ts","lib/review-policy-judgment-day.ts"]){
  assert.equal(lstatSync(join(reference,file)).isFile(),true,"Falta fuente Gentle: "+file);
 }
 return Object.freeze({schema:"asen.p16.reference-acceptance/v1",
  asenSha:expectedAsenSha,referenceSha,referencePackage:"gentle-pi@4.9.0",
  sourcePinned:true,sourceClean:true,scenarioCount:3,repetitionsPerScenario:3,
  requiredAuthenticatedExecutions:18,actualAuthenticatedExecutions:0,
  benchmarkStatus:"BLOCKED_NOT_EXECUTED",
  billingVerified:false,referenceParityVerified:false,
  independentReviewVerified:false,accepted:false,globalFull:false});
}
if(process.argv[1]&&resolve(process.argv[1])===new URL(import.meta.url).pathname){
 try{
  const root=process.env.GITHUB_WORKSPACE;
  const relative="referencia-gentle-shell";
  const report=comprobarReferenciaP16({
   asenRoot:root,referenceRoot:join(root,relative),
   expectedAsenSha:process.env.ASEN_P16_SHA
  });
  const dest=process.env.ASEN_P16_REPORT_DIR;
  assert.ok(dest?.startsWith("/"),"Carpeta de informe no válida");
  mkdirSync(dest,{recursive:true,mode:0o700});
  writeFileSync(join(dest,"fuentes-p16.json"),JSON.stringify(report,null,2)+"\n",{flag:"wx",mode:0o600});
  process.stdout.write(JSON.stringify(report)+"\n");
 }catch(error){console.error("P16 bloqueado: "+(error instanceof Error?error.message:"error"));process.exitCode=1;}
}
