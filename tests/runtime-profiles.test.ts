import test from "node:test";import assert from "node:assert/strict";import {ASEN_PROFILES_SCHEMA,parseRuntimeProfiles,resolveRuntimeRoute,resolveRuntimeDelegationMode,removeProfile,renameProfile,serializeRuntimeProfiles,setActiveProfile,upsertProfile} from "../src/runtime/lifecycle/profiles.js";
import type {Thinking} from "../src/runtime/lifecycle/profiles.js";

for(const thinking of ["off","minimal","low","medium","high","xhigh","max",undefined] as const){
 test(`effort parity profiles round-trip ${thinking??"inherit"}`,()=>{
  const route=thinking===undefined?{}:{thinking};
  const value={schema:ASEN_PROFILES_SCHEMA,active:"main",profiles:[{name:"main",routes:{worker:route}}]};
  const parsed=parseRuntimeProfiles(JSON.stringify(value));assert.deepEqual(parsed,value);assert.ok(parsed);
  assert.deepEqual(parseRuntimeProfiles(serializeRuntimeProfiles(parsed)),value);
  assert.deepEqual(resolveRuntimeRoute({global:parsed},"worker").choice,route);
 });
}
test("effort parity profiles reject invalid values without mutation",()=>{
 const initial={schema:ASEN_PROFILES_SCHEMA,profiles:[{name:"main",routes:{worker:{thinking:"low" as const}}}]},before=serializeRuntimeProfiles(initial);
 for(const thinking of ["extreme","HIGH","inherit","",null,7]){
  const invalid={name:"main",routes:{worker:{thinking:thinking as Thinking}}};
  assert.equal(parseRuntimeProfiles(JSON.stringify({...initial,profiles:[invalid]})),undefined);
  assert.throws(()=>upsertProfile(initial,invalid),/Invalid profile/);
  assert.throws(()=>serializeRuntimeProfiles({...initial,profiles:[invalid]}),/Invalid profiles file/);
  assert.equal(serializeRuntimeProfiles(initial),before);
 }
});

const file=(active="base")=>({schema:ASEN_PROFILES_SCHEMA,active,profiles:[{name:"base",routes:{worker:{model:"free/model",thinking:"medium" as const}}}]});
test("profiles reject malformed, duplicate and dangling active values",()=>{assert.equal(parseRuntimeProfiles("{"),undefined);assert.equal(parseRuntimeProfiles(JSON.stringify({...file(),active:"missing"})),undefined);assert.equal(parseRuntimeProfiles(JSON.stringify({...file(),profiles:[...file().profiles,...file().profiles]})),undefined);});
test("profile parsing preserves prototype-named routes as own data properties",()=>{const raw='{"schema":"asen.runtime-profiles/v1","active":"base","profiles":[{"name":"base","routes":{"constructor":{"thinking":"low"},"toString":{"model":"safe/model"}}}]}';const parsed=parseRuntimeProfiles(raw);assert.ok(parsed);const routes=parsed.profiles[0]!.routes;assert.equal(Object.hasOwn(routes,"constructor"),true);assert.equal(Object.hasOwn(routes,"toString"),true);assert.equal(Object.getPrototypeOf(routes),Object.prototype);assert.equal(resolveRuntimeRoute({global:parsed},"toString").choice?.model,"safe/model");assert.equal(JSON.parse(serializeRuntimeProfiles(parsed)).profiles[0].routes.toString.model,"safe/model");});
test("profile precedence is session project global default",()=>{const g=file(),p={...file(),profiles:[{name:"base",routes:{worker:{model:"project"}}}]},s={...file(),profiles:[{name:"base",routes:{worker:{model:"session"}}}]};assert.equal(resolveRuntimeRoute({global:g,project:p,session:s},"worker").choice?.model,"session");assert.equal(resolveRuntimeRoute({global:g,project:p},"worker").choice?.model,"project");assert.equal(resolveRuntimeRoute({global:g},"worker").choice?.model,"free/model");assert.equal(resolveRuntimeRoute({global:g},"reviewer").source,"default");});
test("route resolution preserves one complete choice without filling absent fields",()=>{const g={...file(),profiles:[{name:"base",routes:{explorer:{model:"configured/model"}}}]};assert.deepEqual(resolveRuntimeRoute({global:g},"explorer"),{choice:{model:"configured/model"},source:"global"});assert.equal(Object.hasOwn(resolveRuntimeRoute({global:g},"explorer").choice!,"thinking"),false);});
test("route resolution ignores inherited object properties and invalid roles",()=>{const active=file();for(const role of ["toString","constructor","__proto__",""]){const result=resolveRuntimeRoute({global:active},role);assert.equal(result.source,"default");assert.equal(result.choice,undefined);}});
test("profile mutations preserve explicit active selection",()=>{const a=file();assert.equal(setActiveProfile(a,"base").active,"base");const b=upsertProfile(a,{name:"review",routes:{reviewer:{thinking:"high"}}});assert.equal(b.profiles.length,2);assert.throws(()=>setActiveProfile(b,"none"));});

test("profile rename/remove/export preserve active semantics",()=>{const a=renameProfile(file(),"base","daily");assert.equal(a.active,"daily");assert.throws(()=>removeProfile(a,"daily"),/active/);const b=upsertProfile(a,{name:"other",routes:{}});const c=setActiveProfile(b,"other");assert.equal(removeProfile(c,"daily").profiles.length,1);assert.match(serializeRuntimeProfiles(c),/asen.runtime-profiles\/v1/);});

test("T05 rechaza claves __proto__ en rutas, sin alterar prototipos",()=>{
 const raw='{"schema":"asen.runtime-profiles/v1","active":"base","profiles":[{"name":"base","routes":{"__proto__":{"model":"nvidia/modelo-aislado"},"worker":{"model":"nvidia/modelo-worker"}}}]}';
 assert.equal(parseRuntimeProfiles(raw),undefined);
 const parsed=JSON.parse(raw) as {profiles:{name:string;routes:Record<string,{model:string}>}[]};
 assert.throws(()=>upsertProfile(file(),parsed.profiles[0]!),/Invalid profile/u);
 assert.equal(({} as Record<string,unknown>)["model"],undefined);
});
test("T05 preserva constructor y toString como datos propios sin heredar modelos",()=>{
 const raw='{"schema":"asen.runtime-profiles/v1","active":"base","profiles":[{"name":"base","routes":{"constructor":{"model":"nvidia/revisor"},"toString":{"thinking":"low"}}}]}';
 const parsed=parseRuntimeProfiles(raw);
 assert.ok(parsed);
 const routes=parsed.profiles[0]!.routes;
 assert.equal(Object.getPrototypeOf(routes),Object.prototype);
 assert.equal(Object.hasOwn(routes,"constructor"),true);
 assert.equal(Object.hasOwn(routes,"toString"),true);
 assert.deepEqual(resolveRuntimeRoute({global:parsed},"constructor"),{
  source:"global",choice:{model:"nvidia/revisor"}
 });
 assert.equal(resolveRuntimeRoute({global:parsed},"worker").source,"default");
 const serialized=serializeRuntimeProfiles(parsed);
 assert.match(serialized,/"constructor"/u);
 assert.match(serialized,/"toString"/u);
 assert.equal(({} as Record<string,unknown>)["thinking"],undefined);
});


test("E1B: perfiles antiguos continúan en modo orgánico y las capas conservan su prioridad",()=>{
 const original=parseRuntimeProfiles(JSON.stringify(file()));assert.ok(original);
 assert.deepEqual(resolveRuntimeDelegationMode({global:original}),{mode:"organic",source:"global"});
 const project=upsertProfile(original,{name:"base",mode:"full-delegation",routes:{worker:{model:"cloud/modelo"}}});
 const restored=parseRuntimeProfiles(serializeRuntimeProfiles(project));assert.ok(restored);
 assert.deepEqual(resolveRuntimeDelegationMode({global:original,project:restored}),{mode:"full-delegation",source:"project"});
 assert.deepEqual(resolveRuntimeDelegationMode({global:restored,session:original}),{mode:"organic",source:"session"});
 assert.deepEqual(resolveRuntimeDelegationMode({}),{mode:"organic",source:"default"});
 assert.equal(restored.profiles[0]?.mode,"full-delegation");
});

test("E1B: un modo inventado no se guarda ni altera perfiles existentes",()=>{
 const original=file(),before=serializeRuntimeProfiles(original);
 for(const value of ["delegar","FULL",null,0,true]){
  const invalid={name:"base",mode:value as never,routes:{}};
  assert.equal(parseRuntimeProfiles(JSON.stringify({...original,profiles:[invalid]})),undefined);
  assert.throws(()=>upsertProfile(original,invalid),/Invalid profile/u);
 }
 assert.equal(serializeRuntimeProfiles(original),before);
});


test("E1B: modificar un perfil no cambia el modo de otro",()=>{
 const file={schema:ASEN_PROFILES_SCHEMA,active:"B",profiles:[
  {name:"A",routes:{worker:{model:"local/uno"}},mode:"organic" as const},
  {name:"B",routes:{worker:{model:"local/dos"}},mode:"full-delegation" as const},
 ]};
 const updated=upsertProfile(file,{name:"A",mode:"organic",routes:{worker:{model:"local/nuevo"}}});
 const parsed=parseRuntimeProfiles(serializeRuntimeProfiles(updated));
 assert.ok(parsed);
 assert.equal(parsed.profiles.find(p=>p.name==="B")?.mode,"full-delegation");
 assert.deepEqual(resolveRuntimeDelegationMode({global:parsed}),{mode:"full-delegation",source:"global"});
 assert.equal(updated.profiles.find(p=>p.name==="A")?.routes.worker?.model,"local/nuevo");
 const reversed=upsertProfile(updated,{name:"B",mode:"organic",routes:{worker:{model:"local/dos"}}});
 assert.equal(reversed.profiles.find(p=>p.name==="B")?.mode,"organic");
 assert.equal(file.profiles[1]?.mode,"full-delegation","nunca muta el objeto de origen");
});
