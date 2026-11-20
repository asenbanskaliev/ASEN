/** Integra pruebas Pi por SO y recibos opcionales de T17/T16.
 * No llama a proveedores, no reejecuta agentes y no autoriza escrituras. */
import {existsSync,lstatSync,mkdirSync,readFileSync,readdirSync,writeFileSync} from "node:fs";
import {resolve,join,dirname} from "node:path";
import {auditFlowPoints16to18} from "../src/runtime/agents/flow-closure-evidence.js";
import type {PiMatrixEvidence,FlowEndToEndWitness} from "../src/runtime/agents/flow-closure-evidence.js";
import type {AgentFlowSeriesPair} from "../src/review/agent-flow-series-comparison.js";

const sha=process.env.ASEN_EXPECTED_SHA??"";
const dir=resolve(process.argv[2]??"matrix-evidence");
const target=resolve(process.argv[3]??"cierre-16-17-18.json");
function readBounded(file:string,limit=150_000):unknown{
 const stat=lstatSync(file);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size<2||stat.size>limit)
  throw Error("Archivo de evidencia no válido");
 return JSON.parse(readFileSync(file,"utf8")) as unknown;
}
function optional<T>(env:string):T|null{
 const value=process.env[env];
 if(!value)return null;
 return readBounded(resolve(value)) as T;
}
const cells:PiMatrixEvidence[]=[];
if(existsSync(dir)){
 const files=readdirSync(dir,{recursive:true}).map(String)
  .filter(name=>/^(?:[^/\\]+[/\\])?[a-z]+-1\.2\.0-(?:tui|rpc|json|print)\.json$/u.test(name))
  .sort();
 for(const file of files)cells.push(readBounded(join(dir,file)) as PiMatrixEvidence);
}
const report=auditFlowPoints16to18({
 sha,matrix:cells,
 flow:optional<FlowEndToEndWitness>("ASEN_T17_EVIDENCE"),
 pairs:optional<AgentFlowSeriesPair[]>("ASEN_T16_EVIDENCE")
});
mkdirSync(dirname(target),{recursive:true});
writeFileSync(target,JSON.stringify(report,null,2)+"\n",{mode:0o600,flag:"wx"});
process.stdout.write(JSON.stringify({
 sha,point18:report.point18.status,piCells:report.point18.cellsObserved,
 point17:report.point17.status,point16:report.point16.status,globalFull:false
})+"\n");
