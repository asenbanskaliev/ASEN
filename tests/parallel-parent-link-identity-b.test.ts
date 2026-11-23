import test from "node:test";
import assert from "node:assert/strict";
import {enlacePiHijoIntacto} from "../src/runtime/agents/parallel-parent-supervisor.js";

type Enlaces=Parameters<typeof enlacePiHijoIntacto>[0];
const enlace={
 batchId:"lote-1",sourceTodoId:"origen-1",sourceRequestId:"peticion-1",
 sourceTodoRevision:2,sourceHead:"a".repeat(40),
 sourceSessionId:"pi-padre",sourceProjectId:"/origen",
 childSessionId:"pi-hijo-1",childProjectId:"/hijo",
 authority:"none",autoDispatch:false,autoMerge:false
};
const comoEnlaces=(items:readonly object[])=>items as unknown as Enlaces;

test("B: solo el enlace Pi exacto mantiene la identidad autorizada",()=>{
 const huella=JSON.stringify(enlace);
 assert.equal(enlacePiHijoIntacto(comoEnlaces([enlace]),"lote-1","origen-1",huella),true);
 for(const cambio of [
  {childSessionId:"pi-hijo-2"},{childProjectId:"/otro-hijo"},
  {sourceRequestId:"otra-peticion"},{sourceTodoRevision:3},
  {sourceHead:"b".repeat(40)},{sourceSessionId:"otro-padre"},
  {authority:"writer"},{autoDispatch:true},{autoMerge:true}
 ]){
  assert.equal(enlacePiHijoIntacto(comoEnlaces([{...enlace,...cambio}]),
   "lote-1","origen-1",huella),false,JSON.stringify(cambio));
 }
 assert.equal(enlacePiHijoIntacto(comoEnlaces([enlace,enlace]),
  "lote-1","origen-1",huella),false);
 assert.equal(enlacePiHijoIntacto(comoEnlaces([]),
  "lote-1","origen-1",huella),false);
 assert.equal(enlacePiHijoIntacto(comoEnlaces([enlace]),
  "otro-lote","origen-1",huella),false);
});
