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
 assert.match(completo,/github\.event\.action == 'labeled' \|\| github\.event\.pull_request\.draft == false/u);
 for(const job of ["agentes-t02-t05-t06","test","architecture","pi-support-matrix"]){
  const start=completo.indexOf("\n  "+job+":");
  assert.ok(start>=0,"Falta trabajo "+job);
  const block=completo.slice(start,start+460);
  assert.match(block,/if: >-/u,"Falta control de cierre "+job);
  assert.match(block,/github\.event\.action == 'labeled'/u,"Una etiqueta ajena no puede omitir la prueba "+job);
  assert.match(block,/github\.event\.pull_request\.draft == false/u,"Falta cierre por tanda "+job);
 }
 assert.match(completo,/always\(\) && \(github\.event_name == 'push' \|\| github\.event\.action == 'labeled'/u);
 assert.match(completo,/branches: \[main\]/u);
});
test("La entrega completa conserva las tres plataformas y el SHA exacto",()=>{
 assert.match(entrega,/types: \[opened, synchronize, reopened, ready_for_review, labeled\]/u);
 assert.match(entrega,/github\.event\.pull_request\.draft == false/u);
 assert.match(entrega,/github\.event\.action == 'labeled' \|\| github\.event\.pull_request\.draft == false/u);
 assert.match(entrega,/github\.event_name == 'push'/u);
 assert.match(entrega,/ubuntu-24\.04, windows-latest, macos-latest/u);
 assert.match(entrega,/ASEN_EXPECTED_SHA/u);
});
test("Una etiqueta ajena no convierte controles obligatorios en OMITIDOS",()=>{
 const trabajos=["agentes-t02-t05-t06","test","test-shard-coverage","architecture","pi-support-matrix"];
 for(const trabajo of trabajos){
  const inicio=completo.indexOf("\n  "+trabajo+":");
  assert.ok(inicio>=0,"No existe "+trabajo);
  const fin=completo.indexOf("\n  ",inicio+4);
  const cabecera=completo.slice(inicio,fin<0?undefined:fin).split("\n    steps:")[0];
  assert.match(cabecera,/github\.event\.action == \x27labeled\x27/u,trabajo+" debe ejecutarse para cualquier etiqueta");
  assert.doesNotMatch(cabecera,/github\.event\.label\.name == \x27validacion-completa\x27/u,trabajo+" no debe filtrar etiquetas");
 }
 const paquete=entrega.split("\n  package:")[1]?.split("\n    strategy:")[0]??"";
 assert.match(paquete,/github\.event\.action == \x27labeled\x27/u);
 assert.doesNotMatch(paquete,/github\.event\.label\.name/u);
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
