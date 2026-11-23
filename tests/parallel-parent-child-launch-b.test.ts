import {describe,it,expect} from "vitest";
import {iniciarDosHijosPi,type ReciboInicioPi} from "../src/runtime/agents/parallel-parent-child-launch.js";

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
 const anfitrion={async crearSesionHija(h:typeof hijos[number]){
  llamadas.push(h.id);return {sesion:"sesion-"+h.id,proyecto:h.proyecto,revision:h.revision};
 }};
 return {hijos,diario,anfitrion,llamadas,recibos,
  confirmar:async()=>true,validar:async()=>{}};
}
describe("inicio seguro de dos sesiones Pi",()=>{
 it("bloquea si el anfitrión no permite crear sesiones",async()=>{
  const s=escenario();const r=await iniciarDosHijosPi({...s,anfitrion:{}});
  expect(r.estado).toBe("bloqueado");expect(s.llamadas).toHaveLength(0);
 });
 it("crea dos sesiones distintas con dos autorizaciones y recibos",async()=>{
  const s=escenario();let aprobaciones=0;
  const r=await iniciarDosHijosPi({...s,confirmar:async()=>{aprobaciones++;return true;}});
  expect(r.estado).toBe("creados");expect(aprobaciones).toBe(2);
  expect(s.llamadas).toEqual(["uno","dos"]);
  expect([...s.recibos.values()].map(x=>x.estado)).toEqual(["creado","creado"]);
  expect(r.concedePermisos).toBe(false);expect(r.aceptado).toBe(false);
 });
 it("denegación individual impide ambos inicios",async()=>{
  const s=escenario();let n=0;
  const r=await iniciarDosHijosPi({...s,confirmar:async()=>++n!==2});
  expect(r.estado).toBe("bloqueado");expect(s.llamadas).toHaveLength(0);
 });
 it("ámbitos solapados o identidad repetida se bloquean",async()=>{
  const s=escenario();s.hijos[1]!.superficies=["src/a/sub"];
  expect((await iniciarDosHijosPi(s)).estado).toBe("bloqueado");
  expect(s.llamadas).toHaveLength(0);
 });
 it("reinicio no repite una operación ya registrada",async()=>{
  const s=escenario();expect((await iniciarDosHijosPi(s)).estado).toBe("creados");
  expect((await iniciarDosHijosPi(s)).estado).toBe("bloqueado");
  expect(s.llamadas).toHaveLength(2);
 });
 it("resultado incierto bloquea el segundo inicio y exige revisión",async()=>{
  const s=escenario();
  const r=await iniciarDosHijosPi({...s,anfitrion:{crearSesionHija:async()=>{throw Error("sin respuesta");}}});
  expect(r.estado).toBe("revision-manual");
  expect(s.recibos.get("uno")?.estado).toBe("incierto");
  expect(s.recibos.has("dos")).toBe(false);
 });
 it("cambio de identidad del padre bloquea sin relanzar",async()=>{
  const s=escenario();let n=0;
  const r=await iniciarDosHijosPi({...s,validar:async()=>{if(++n===4)throw Error("sesión cambiada");}});
  expect(r.estado).toBe("bloqueado");expect(s.llamadas).toHaveLength(0);
 });
 it("rechaza sesiones duplicadas sin aceptar el resultado",async()=>{
  const s=escenario();
  const r=await iniciarDosHijosPi({...s,anfitrion:{crearSesionHija:async(h)=>({
   sesion:"igual",proyecto:h.proyecto,revision:h.revision
  })}});
  expect(r.estado).toBe("revision-manual");
  expect(r.recibos).toHaveLength(2);
 });
});
