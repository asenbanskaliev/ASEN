import test from "node:test";
import assert from "node:assert/strict";
import {validarCatalogoRevisionReutilizada} from
 "../scripts/t06-catalogo-revision-reutilizada.mjs";

const A="nvidia/nemotron-3-super-120b-a12b";
const B="nvidia/nemotron-3.5-super-vl-120b-a12b";
const reutilizado=()=>({requestedModel:B,observedModel:B,
 verdict:"pass",reusedFromRunId:"45048377977",writerAuthority:false,
 acceptance:"not-accepted"});

test("T06 acepta catálogo con el modelo nuevo aunque omita el ya verificado",()=>{
 const resultado=validarCatalogoRevisionReutilizada({
  completo:true,modelos:[A]},reutilizado());
 assert.equal(resultado.pruebaNuevaAutorizada,true);
 assert.equal(resultado.segundoModeloNoRepetido,true);
 assert.equal(resultado.modeloNuevo,A);
 assert.equal(resultado.modeloReutilizado,B);
 assert.equal(Object.isFrozen(resultado),true);
});

test("T06 impide consumir si falta el modelo nuevo, aunque exista el anterior",()=>{
 assert.throws(()=>validarCatalogoRevisionReutilizada({
  completo:true,modelos:[B]},reutilizado()),/Nemotron 3 Super no figura/u);
 assert.throws(()=>validarCatalogoRevisionReutilizada({
  completo:true,modelos:[]},reutilizado()),/Nemotron 3 Super no figura/u);
});

test("T06 rechaza catálogo incompleto o sin datos fiables",()=>{
 for(const v of [undefined,null,{completo:false,modelos:[A]},
  {completo:true,modelos:null},{completo:true,modelos:"inventado"}]){
  assert.throws(()=>validarCatalogoRevisionReutilizada(v,reutilizado()),
   /catálogo NVIDIA no verificado/u);
 }
});

test("T06 no admite sustituir, inventar ni escalar el dictamen anterior",()=>{
 for(const cambio of [
  {reusedFromRunId:"otro"}, {requestedModel:A},{observedModel:A},
  {verdict:"unknown"},{writerAuthority:true},{acceptance:"accepted"}
 ]){
  assert.throws(()=>validarCatalogoRevisionReutilizada(
   {completo:true,modelos:[A]},{...reutilizado(),...cambio}),/histórico válido/u);
 }
 assert.throws(()=>validarCatalogoRevisionReutilizada({completo:true,modelos:[A]},null));
});
