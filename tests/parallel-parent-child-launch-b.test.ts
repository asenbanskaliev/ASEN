import {describe,it} from "node:test";
import assert from "node:assert/strict";
import {iniciarDosHijosPi,type ReciboInicioPi,type SolicitudHijoPi} from "../src/runtime/agents/parallel-parent-child-launch.js";

const sha="a".repeat(40);
function escenario(){
 const recibos=new Map<string,ReciboInicioPi>();
 const llamadas:string[]=[];
 const hijos=[
  {id:"uno",proyecto:"/tmp/hijo-uno",revision:sha,superficies:["src/a"]},
  {id:"dos",proyecto:"/tmp/hijo-dos",revision:sha,superficies:["src/b"]}
 ];
 const diario={
  async reservar(r:ReciboInicioPi){if(recibos.has(r.id))throw Error("duplicado");recibos.set(r.id,r);},
  async finalizar(r:ReciboInicioPi){recibos.set(r.id,r);}
 };
 const anfitrion={async crearSesionHija(h:SolicitudHijoPi){
  llamadas.push(h.id);return {sesion:"sesion-"+h.id,proyecto:h.proyecto,revision:h.revision};
 }};
 return {hijos,diario,anfitrion,llamadas,recibos,
  confirmar:async()=>true,validar:async()=>{}};
}
describe("inicio seguro de dos sesiones Pi",()=>{
 it("bloquea si el anfitrión no permite crear sesiones",async()=>{
  const s=escenario();const r=await iniciarDosHijosPi({...s,anfitrion:{}});
  assert.equal(r.estado,"bloqueado");assert.equal(s.llamadas.length,0);
 });
 it("crea dos sesiones distintas con dos autorizaciones y recibos",async()=>{
  const s=escenario();let aprobaciones=0;
  const r=await iniciarDosHijosPi({...s,confirmar:async()=>{aprobaciones++;return true;}});
  assert.equal(r.estado,"creados");assert.equal(aprobaciones,2);
  assert.deepEqual(s.llamadas,["uno","dos"]);
  assert.deepEqual([...s.recibos.values()].map(x=>x.estado),["creado","creado"]);
  assert.equal(r.concedePermisos,false);assert.equal(r.aceptado,false);
 });
 it("denegación individual impide ambos inicios",async()=>{
  const s=escenario();let n=0;
  const r=await iniciarDosHijosPi({...s,confirmar:async()=>++n!==2});
  assert.equal(r.estado,"bloqueado");assert.equal(s.llamadas.length,0);
 });
 it("ámbitos solapados o identidad repetida se bloquean",async()=>{
  const s=escenario();s.hijos[1]!.superficies=["src/a/sub"];
  assert.equal((await iniciarDosHijosPi(s)).estado,"bloqueado");
  assert.equal(s.llamadas.length,0);
 });
 it("reinicio no repite una operación ya registrada",async()=>{
  const s=escenario();assert.equal((await iniciarDosHijosPi(s)).estado,"creados");
  assert.equal((await iniciarDosHijosPi(s)).estado,"bloqueado");
  assert.equal(s.llamadas.length,2);
 });
 it("resultado incierto bloquea el segundo inicio y exige revisión",async()=>{
  const s=escenario();
  const r=await iniciarDosHijosPi({...s,anfitrion:{crearSesionHija:async()=>{throw Error("sin respuesta");}}});
  assert.equal(r.estado,"revision-manual");
  assert.equal(s.recibos.get("uno")?.estado,"incierto");
  assert.equal(s.recibos.has("dos"),false);
 });
 it("cambio de identidad del padre bloquea sin relanzar",async()=>{
  const s=escenario();let n=0;
  const r=await iniciarDosHijosPi({...s,validar:async()=>{if(++n===4)throw Error("sesión cambiada");}});
  assert.equal(r.estado,"bloqueado");assert.equal(s.llamadas.length,0);
 });
 it("rechaza sesiones duplicadas sin aceptar el resultado",async()=>{
  const s=escenario();
  const r=await iniciarDosHijosPi({...s,anfitrion:{crearSesionHija:async(h)=>({
   sesion:"igual",proyecto:h.proyecto,revision:h.revision
  })}});
  assert.equal(r.estado,"revision-manual");
  assert.equal(r.recibos.length,2);
 });
});
