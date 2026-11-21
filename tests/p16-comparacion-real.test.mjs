/** Pruebas negativas del contrato P16; no simulan ni acreditan llamadas NVIDIA. */
import test from "node:test";
import assert from "node:assert/strict";
import {CASOS,REPETICIONES,TOTAL,MODELO,REFERENCIA_SHA,validarInformeP16} from "../scripts/p16-comparacion-real.mjs";
const base=()=>({esquema:"asen.p16.pi-18-comparable/v1",
 referenciaSha:REFERENCIA_SHA,modelo:MODELO,sesionesPrevistas:TOTAL,
 sesionesAutenticadas:0,comparacionCompletada:false,sesiones:[],
 precioVerificado:false,equivalenciaFuncionalCompleta:false,
 revisionIndependiente:false,globalFull:false});
test("P16 exige exactamente tres casos, tres repeticiones y dos sistemas",()=>{
 assert.equal(CASOS.length,3);
 assert.equal(new Set(CASOS.map(x=>x.id)).size,3);
 assert.equal(REPETICIONES,3);assert.equal(TOTAL,18);
 for(const caso of CASOS){
  assert.ok(caso.enunciado&&caso.esperado);
 }
});
test("No confunde la referencia comprobada con la comparacion ejecutada",()=>{
 assert.equal(validarInformeP16(base()),true);
 assert.throws(()=>validarInformeP16({...base(),comparacionCompletada:true}));
});
test("No admite sesiones repetidas ni resultados sin evidencia",()=>{
 const fila={caso:"CALCULO",repeticion:1,sistema:"ASEN",
  modeloDeclarado:MODELO,sinHerramientas:true,verificada:true};
 assert.throws(()=>validarInformeP16({...base(),sesiones:[fila,fila],
  sesionesAutenticadas:2}));
 assert.throws(()=>validarInformeP16({...base(),sesiones:[fila],
  sesionesAutenticadas:0}));
 assert.throws(()=>validarInformeP16({...base(),sesiones:[{...fila,
  modeloDeclarado:"otro"}],sesionesAutenticadas:1}));
});
test("No concede paridad, precio, revision ni FULL",()=>{
 for(const campo of ["precioVerificado","equivalenciaFuncionalCompleta",
  "revisionIndependiente","globalFull"])
  assert.throws(()=>validarInformeP16({...base(),[campo]:true}));
});
