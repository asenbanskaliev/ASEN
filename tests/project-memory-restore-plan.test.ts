import assert from "node:assert/strict";
import test from "node:test";

const MODULE_URL=new URL("../src/memory/project-memory-restore-plan.js",import.meta.url);
const SCHEMA="asen.project-memory-restore-plan/v1";
const MODE="replace-dedicated-project-store" as const;
const UNCONDITIONAL=["unverified-evidence","memory-lease-missing","pre-effect-backup-unproved","rollback-unproved","rebind-unproved","human-confirmation-required"] as const;

type SidecarState="absent"|"present"|"unknown";
type Input={
 mode:typeof MODE;
 stagedDatabasePath:string;
 targetDatabasePath:string;
 expectedProjectId:string;
 stagedDigest:string;
 stagingReceiptReference:string;
 targetObservedIdentity:{kind:"dedicated-project-store"|"shared-project-store"|"unknown";projectId:string;dev:number;ino:number;birthtimeMs:number};
 targetOwnershipLabel:"dedicated-project-store"|"shared-project-store"|"unknown";
 targetLifecycleLabel:"quiescent"|"active"|"unknown";
 activeBindingCount:number;
 foreignProjectIds:string[];
 collisions:{sessionIds:string[];observationIds:string[];relationIds:string[];tombstoneIds:string[]};
 sidecars:{stage:{wal:SidecarState;shm:SidecarState};target:{wal:SidecarState;shm:SidecarState}};
};
type Result={schema:typeof SCHEMA;status:"blocked";executable:false;authorized:false;revalidationRequired:true;blockers:readonly string[]};
type Plan=(input:unknown)=>Result;

async function api():Promise<Plan>{
 let loaded:Record<string,unknown>={};
 try{loaded=await import(MODULE_URL.href) as Record<string,unknown>;}catch(error){if(!(typeof error==="object"&&error!==null&&"code" in error&&"message" in error&&error.code==="ERR_MODULE_NOT_FOUND"&&String(error.message).includes("project-memory-restore-plan")))throw error;}
 assert.equal(typeof loaded.planProjectMemoryRestore,"function","project-memory restore plan capability missing");
 return loaded.planProjectMemoryRestore as Plan;
}
function good():Input{return {
 mode:MODE,
 stagedDatabasePath:"C:\\private-stage\\memory.sqlite",
 targetDatabasePath:"C:\\private-target\\memory.sqlite",
 expectedProjectId:"project-a",
 stagedDigest:"sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
 stagingReceiptReference:"receipt-u7b-001",
 targetObservedIdentity:{kind:"dedicated-project-store",projectId:"project-a",dev:42,ino:1001,birthtimeMs:1760618096000},
 targetOwnershipLabel:"dedicated-project-store",
 targetLifecycleLabel:"quiescent",
 activeBindingCount:0,
 foreignProjectIds:[],
 collisions:{sessionIds:[],observationIds:[],relationIds:[],tombstoneIds:[]},
 sidecars:{stage:{wal:"absent",shm:"absent"},target:{wal:"absent",shm:"absent"}},
};}
function expected(...conditional:string[]):Result{return {schema:SCHEMA,status:"blocked",executable:false,authorized:false,revalidationRequired:true,blockers:[...conditional,...UNCONDITIONAL]};}
function clone<T>(value:T):T{return structuredClone(value);}
function deepFreeze<T>(value:T):T{if(value&&typeof value==="object"){Object.freeze(value);for(const child of Object.values(value))deepFreeze(child);}return value;}
function assertSafeShape(result:Result){
 assert.deepEqual(Object.keys(result),["schema","status","executable","authorized","revalidationRequired","blockers"]);
 assert.equal(result.status,"blocked");assert.equal(result.executable,false);assert.equal(result.authorized,false);assert.equal(result.revalidationRequired,true);
 assert.equal(Object.isFrozen(result),true);assert.equal(Object.isFrozen(result.blockers),true);
 assert.equal(new Set(result.blockers).size,result.blockers.length);assert.ok(result.blockers.length<=26);assert.ok(JSON.stringify(result).length<=1024);
 assert.equal("description" in result,false);assert.equal("planDigest" in result,false);assert.equal("consentRequired" in result,false);assert.equal("ready" in result,false);
}

test("complete-looking caller assertions remain blocked by every unconditional authority gap",async()=>{
 const plan=await api(),input=good(),result=plan(input);
 assert.deepEqual(result,expected());assertSafeShape(result);
});

test("returns a stable deterministic frozen projection without a consent-ready status",async()=>{
 const plan=await api(),first=plan(good()),second=plan(clone(good()));
 assert.deepEqual(second,first);assert.notEqual(second,first);assertSafeShape(first);assertSafeShape(second);
 assert.equal(JSON.stringify(first),JSON.stringify(expected()));
});

test("invalid top-level and incomplete request shapes fail closed instead of throwing",async()=>{
 const plan=await api();
 for(const input of [undefined,null,false,0,"request",[],{}, {mode:MODE}, {...good(),mode:"merge"}, {...good(),stagedDatabasePath:"relative.sqlite"}, {...good(),targetDatabasePath:"relative.sqlite"}]){
  const result=plan(input);assert.deepEqual(result,expected("invalid-request"));assertSafeShape(result);
 }
});

test("malformed and overlong facts are bounded and never echoed",async()=>{
 const plan=await api(),marker=`PRIVATE-${"x".repeat(4096)}`,cases:unknown[]=[
  {...good(),expectedProjectId:marker},
  {...good(),stagedDigest:marker},
  {...good(),stagingReceiptReference:marker},
  {...good(),targetObservedIdentity:{...good().targetObservedIdentity,projectId:marker}},
  {...good(),activeBindingCount:-1},
  {...good(),activeBindingCount:1.5},
  {...good(),foreignProjectIds:Array.from({length:65},(_,index)=>`foreign-${index}`)},
  {...good(),collisions:{...good().collisions,sessionIds:[1] as unknown as string[]}},
  {...good(),sidecars:{...good().sidecars,stage:{wal:"verified-absent",shm:"absent"}}},
 ];
 for(const input of cases){const result=plan(input);assert.deepEqual(result,expected("invalid-request"));assertSafeShape(result);const encoded=JSON.stringify(result);assert.equal(encoded.includes("PRIVATE-"),false);assert.equal(encoded.includes("foreign-64"),false);}
});

test("accepts POSIX and Windows lexical absolute paths and zero-valued physical identity without host I/O",async()=>{
 const plan=await api(),windows=good(),posix={...good(),stagedDatabasePath:"/private-stage/memory.sqlite",targetDatabasePath:"/private-target/memory.sqlite"},zeroIdentity={...good(),targetObservedIdentity:{...good().targetObservedIdentity,dev:0,ino:0,birthtimeMs:0}};
 assert.deepEqual(plan(windows),expected());assert.deepEqual(plan(posix),expected());assert.deepEqual(plan(zeroIdentity),expected());
});

test("same staged and target path is an explicit blocker",async()=>{
 const plan=await api(),input=good();input.targetDatabasePath=input.stagedDatabasePath;
 assert.deepEqual(plan(input),expected("same-path"));
});

test("missing, malformed, negative, fractional, or unsafe physical identity facts make the request invalid",async()=>{
 const plan=await api(),identity=good().targetObservedIdentity;
 const cases=[
  {kind:identity.kind,projectId:identity.projectId,ino:identity.ino,birthtimeMs:identity.birthtimeMs},
  {kind:identity.kind,projectId:identity.projectId,dev:identity.dev,birthtimeMs:identity.birthtimeMs},
  {kind:identity.kind,projectId:identity.projectId,dev:identity.dev,ino:identity.ino},
  {...identity,dev:"42"},
  {...identity,dev:-1},
  {...identity,ino:-1},
  {...identity,birthtimeMs:-1},
  {...identity,dev:1.5},
  {...identity,ino:Number.MAX_SAFE_INTEGER+1},
  {...identity,birthtimeMs:Number.POSITIVE_INFINITY},
 ];
 for(const targetObservedIdentity of cases)assert.deepEqual(plan({...good(),targetObservedIdentity}),expected("invalid-request"));
});

test("valid physical identity with the wrong kind or project remains identity-unverified",async()=>{
 const plan=await api(),identity=good().targetObservedIdentity;
 for(const targetObservedIdentity of [{...identity,kind:"unknown"},{...identity,kind:"shared-project-store"},{...identity,projectId:"other-project"}] as const){
  assert.deepEqual(plan({...good(),targetObservedIdentity}),expected("target-identity-unverified"));
 }
});

test("target ownership assertions distinguish shared and unknown ownership",async()=>{
 const plan=await api();
 for(const targetOwnershipLabel of ["shared-project-store","unknown"] as const)assert.deepEqual(plan({...good(),targetOwnershipLabel}),expected("target-ownership-unverified"));
});

test("active and unknown lifecycle states have distinct conservative blockers",async()=>{
 const plan=await api();
 assert.deepEqual(plan({...good(),targetLifecycleLabel:"active"}),expected("target-lifecycle-active"));
 assert.deepEqual(plan({...good(),targetLifecycleLabel:"unknown"}),expected("target-lifecycle-unverified"));
});

test("every active binding count blocks replacement",async()=>{
 const plan=await api();
 for(const activeBindingCount of [1,2,Number.MAX_SAFE_INTEGER])assert.deepEqual(plan({...good(),activeBindingCount}),expected("active-bindings-present"));
});

test("any foreign project blocks replacement without echoing its identity",async()=>{
 const plan=await api(),secret="foreign-private-project",result=plan({...good(),foreignProjectIds:[secret]});
 assert.deepEqual(result,expected("foreign-projects-present"));assert.equal(JSON.stringify(result).includes(secret),false);
});

for(const [field,code] of [["sessionIds","session-id-collision"],["observationIds","observation-id-collision"],["relationIds","relation-id-collision"],["tombstoneIds","tombstone-id-collision"]] as const)test(`${field} global-ID collisions have their own blocker`,async()=>{
 const plan=await api(),input=good();input.collisions[field].push(`private-${field}`);
 const result=plan(input);assert.deepEqual(result,expected(code));assert.equal(JSON.stringify(result).includes(`private-${field}`),false);
});

for(const [location,sidecar,presentCode,unknownCode] of [
 ["stage","wal","stage-wal-present","stage-wal-unknown"],
 ["stage","shm","stage-shm-present","stage-shm-unknown"],
 ["target","wal","target-wal-present","target-wal-unknown"],
 ["target","shm","target-shm-present","target-shm-unknown"],
] as const)test(`${location} ${sidecar.toUpperCase()} presence and uncertainty block independently`,async()=>{
 const plan=await api();
 for(const [state,code] of [["present",presentCode],["unknown",unknownCode]] as const){const input=good();input.sidecars[location][sidecar]=state;assert.deepEqual(plan(input),expected(code));}
});

test("blockers use one deterministic fixed order across combined adverse facts",async()=>{
 const plan=await api(),input=good();
 Object.assign(input,{targetDatabasePath:input.stagedDatabasePath,targetOwnershipLabel:"unknown",targetLifecycleLabel:"active",activeBindingCount:3,foreignProjectIds:["foreign"]});
 input.targetObservedIdentity={...input.targetObservedIdentity,kind:"unknown",projectId:"other"};input.collisions={sessionIds:["s"],observationIds:["o"],relationIds:["r"],tombstoneIds:["t"]};input.sidecars={stage:{wal:"present",shm:"unknown"},target:{wal:"unknown",shm:"present"}};
 assert.deepEqual(plan(input),expected("same-path","target-identity-unverified","target-ownership-unverified","target-lifecycle-active","active-bindings-present","foreign-projects-present","session-id-collision","observation-id-collision","relation-id-collision","tombstone-id-collision","stage-wal-present","stage-shm-unknown","target-wal-unknown","target-shm-present"));
});

test("does not mutate even deeply frozen caller facts",async()=>{
 const plan=await api(),input=deepFreeze(good()),before=clone(input),result=plan(input);
 assert.deepEqual(input,before);assert.deepEqual(result,expected());assertSafeShape(result);
});

test("extra descriptions cannot become verified evidence or trigger network work",async()=>{
 const plan=await api(),originalFetch=globalThis.fetch,calls:string[]=[];
 globalThis.fetch=((..._args:Parameters<typeof fetch>)=>{calls.push("fetch");throw new Error("network forbidden");}) as typeof fetch;
 try{const input={...good(),descriptions:{owner:"operator says owned",lifecycle:"operator says stopped",confirmation:"yes"},trusted:true,approved:true};const result=plan(input);assert.deepEqual(result,expected());assertSafeShape(result);assert.deepEqual(calls,[]);}
 finally{globalThis.fetch=originalFetch;}
});
