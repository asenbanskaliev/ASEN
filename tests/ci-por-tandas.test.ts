import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const leer=(ruta:string)=>readFileSync(ruta,"utf8");
const rapido=leer(".github/workflows/ci-rapida.yml");
const completo=leer(".github/workflows/ci.yml");
const entrega=leer(".github/workflows/release-gate.yml");

test("Cada cambio abre una CI rápida sin modelos ni secretos",()=>{
 assert.match(rapido,/types: \[opened, synchronize, reopened, ready_for_review\]/u);
 assert.match(rapido,/npm ci --ignore-scripts --no-audit --no-fund/u);
 assert.match(rapido,/npm run typecheck/u);
 assert.match(rapido,/persist-credentials: false/u);
 assert.match(rapido,/ASEN_EXPECTED_SHA/u);
 assert.doesNotMatch(rapido,/secrets\.|NVIDIA_API_KEY|npm test|npm run release:check/u);
});
test("La CI completa verifica cada cambio listo sin cancelar por etiquetas ajenas",()=>{
 assert.match(completo,/types: \[opened, synchronize, reopened, ready_for_review, labeled\]/u);
 assert.match(completo,/github\.event\.pull_request\.draft == false/u);
 assert.match(completo,/github\.event\.label\.name != 'validacion-completa' && github\.run_id \|\| 'validation'/u);
 for(const job of ["agentes-t02-t05-t06","test","architecture","pi-support-matrix"]){
  const start=completo.indexOf("\n  "+job+":");
  assert.ok(start>=0,"Falta trabajo "+job);
  const block=completo.slice(start,start+460);
  assert.match(block,/if: >-/u,"Falta control de cierre "+job);
  assert.match(block,/validacion-completa/u,"Falta etiqueta explícita "+job);
  assert.match(block,/github\.event\.pull_request\.draft == false/u,"Falta cierre por tanda "+job);
 }
 assert.match(completo,/always\(\) && \(github\.event_name == 'push'/u);
 assert.match(completo,/branches: \[main\]/u);
});
test("La entrega completa conserva las tres plataformas y el SHA exacto",()=>{
 assert.match(entrega,/types: \[opened, synchronize, reopened, ready_for_review, labeled\]/u);
 assert.match(entrega,/github\.event\.pull_request\.draft == false/u);
 assert.match(entrega,/github\.event\.label\.name == 'validacion-completa'/u);
 assert.match(entrega,/github\.event_name == 'push'/u);
 assert.match(entrega,/ubuntu-24\.04, windows-latest, macos-latest/u);
 assert.match(entrega,/ASEN_EXPECTED_SHA/u);
});
test("Cuatro Windows y dos macOS conservan cobertura exacta de siete recibos",()=>{
 for(let n=0;n<4;n++)assert.ok(completo.includes(
  "- {os: windows-latest, shard: "+n+", count: 4}"));
 for(let n=0;n<2;n++)assert.ok(completo.includes(
  "- {os: macos-latest, shard: "+n+", count: 2}"));
 assert.match(completo,/max-parallel: 7/u);
 assert.match(completo,/name: test-shard-coverage/u);
 assert.match(completo,/node scripts\/ci-shard-receipts\.mjs verify/u);
});
