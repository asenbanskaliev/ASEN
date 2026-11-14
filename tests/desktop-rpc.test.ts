import assert from "node:assert/strict";
import test from "node:test";
import {
 MAX_ERROR_MESSAGE_CHARS,
 MAX_REQUEST_BYTES,
 MAX_REQUEST_ID_LENGTH,
 METHOD_PATTERN,
 RPC_ERRORS,
 createDesktopRpcRouter,
 parseDesktopRpcRequest,
 validateRequest,
 type DesktopRpcRequest,
} from "../src/runtime/desktop-rpc.js";

const req=(method:string,extra:Record<string,unknown>={})=>({requestId:"r-1",method,...extra});

test("validateRequest accepts a well-formed request and keeps params verbatim",()=>{
 const params={session:"a",limit:3,flag:true};
 assert.deepEqual(validateRequest({requestId:"r-1",method:"list_jobs",params}),{requestId:"r-1",method:"list_jobs",params});
 assert.deepEqual(validateRequest({requestId:"r-1",method:"get_snapshot"}),{requestId:"r-1",method:"get_snapshot"});
 assert.deepEqual(validateRequest({requestId:"r-1",method:"get_snapshot",params:{}}),{requestId:"r-1",method:"get_snapshot",params:{}});
});

test("validateRequest rejects every unusable requestId shape",()=>{
 assert.match((validateRequest({method:"list_jobs"}) as {error:string}).error,/requestId/);
 assert.match((validateRequest({requestId:42,method:"list_jobs"}) as {error:string}).error,/requestId/);
 assert.match((validateRequest({requestId:"",method:"list_jobs"}) as {error:string}).error,/requestId/);
 assert.match((validateRequest({requestId:"line\nbreak",method:"list_jobs"}) as {error:string}).error,/requestId/);
 const oversize="x".repeat(MAX_REQUEST_ID_LENGTH+1);
 assert.match((validateRequest({requestId:oversize,method:"list_jobs"}) as {error:string}).error,/128/);
 assert.deepEqual(validateRequest({requestId:"x".repeat(MAX_REQUEST_ID_LENGTH),method:"list_jobs"}),{requestId:"x".repeat(MAX_REQUEST_ID_LENGTH),method:"list_jobs"});
});

test("validateRequest rejects method names outside the bounded vocabulary",()=>{
 for(const method of ["List_Jobs","1job","list-jobs","list jobs","",  "LIST", "a".repeat(65), "list\u0000jobs", 42, null, undefined]){
  const result=validateRequest({requestId:"r-1",method:method as unknown});
  assert.match((result as {error:string}).error,/method/,`expected rejection for ${JSON.stringify(method)}`);
 }
 assert.equal(typeof METHOD_PATTERN,"object");
 assert.deepEqual(validateRequest({requestId:"r-1",method:"a".repeat(64)}),{requestId:"r-1",method:"a".repeat(64)});
});

test("validateRequest rejects non-objects and non-object params",()=>{
 for(const raw of [null,undefined,"list_jobs",42,true,[1,2],[{requestId:"r-1",method:"list_jobs"}]]){
  assert.match((validateRequest(raw) as {error:string}).error,/object/,`expected rejection for ${JSON.stringify(raw)}`);
 }
 assert.match((validateRequest({requestId:"r-1",method:"list_jobs",params:[]}) as {error:string}).error,/params/);
 assert.match((validateRequest({requestId:"r-1",method:"list_jobs",params:"x"}) as {error:string}).error,/params/);
});

test("parseDesktopRpcRequest enforces the 64 KiB transport bound before validation",()=>{
 const inside=JSON.stringify(req("list_jobs",{params:{blob:"y".repeat(64)}}));
 assert.equal(Buffer.byteLength(inside,"utf8")<=MAX_REQUEST_BYTES,true);
 assert.deepEqual(parseDesktopRpcRequest(inside),validateRequest(JSON.parse(inside)));
 const padded=req("list_jobs",{params:{blob:"y".repeat(MAX_REQUEST_BYTES)}});
 assert.match((parseDesktopRpcRequest(JSON.stringify(padded)) as {error:string}).error,/65536/);
 assert.match((parseDesktopRpcRequest("{") as {error:string}).error,/JSON/);
 assert.match((parseDesktopRpcRequest("") as {error:string}).error,/JSON/);
});

test("router exposes only the read-only vocabulary as built-in stubs",async()=>{
 const router=createDesktopRpcRouter();
 assert.deepEqual([...router.listMethods()],["get_permission_mode","get_snapshot","list_jobs","list_subagents"]);
 assert.deepEqual(await router.handle(req("list_subagents")),{requestId:"r-1",result:{agents:[]}});
 assert.deepEqual(await router.handle(req("list_jobs")),{requestId:"r-1",result:{jobs:[]}});
 assert.deepEqual(await router.handle(req("get_permission_mode")),{requestId:"r-1",result:{mode:"normal"}});
 assert.deepEqual(await router.handle(req("get_snapshot")),{requestId:"r-1",result:{}});
});

test("register replaces a read-only stub when the host wires a real projection",async()=>{
 const router=createDesktopRpcRouter();
 router.register("list_jobs",params=>({jobs:[{id:`job-${String(params.session)}`}],seen:params}));
 assert.deepEqual(await router.handle({requestId:"r-9",method:"list_jobs",params:{session:"s-1"}}),{requestId:"r-9",result:{jobs:[{id:"job-s-1"}],seen:{session:"s-1"}}});
 assert.deepEqual([...router.listMethods()],["get_permission_mode","get_snapshot","list_jobs","list_subagents"]);
 router.register("read_extra",()=>({ok:true}));
 assert.deepEqual([...router.listMethods()],["get_permission_mode","get_snapshot","list_jobs","list_subagents","read_extra"]);
});

test("register refuses names and handlers that could break dispatch",()=>{
 const router=createDesktopRpcRouter();
 assert.throws(()=>router.register("Read_Jobs",()=>1),/method name/);
 assert.throws(()=>router.register("",()=>1),/method name/);
 assert.throws(()=>router.register("a".repeat(65),()=>1),/method name/);
 assert.throws(()=>router.register("read_extra",undefined as never),/handler/);
 assert.deepEqual([...router.listMethods()],["get_permission_mode","get_snapshot","list_jobs","list_subagents"]);
});

test("a registered read handler receives an empty params object by default",async()=>{
 const router=createDesktopRpcRouter();
 let seen:Record<string,unknown>|null=null;
 router.register("echo_shape",params=>{seen=params;return {ok:true};});
 assert.deepEqual(await router.handle(req("echo_shape")),{requestId:"r-1",result:{ok:true}});
 assert.deepEqual(seen,{});
});

test("unregistered methods are refused without touching the handler table",async()=>{
 const router=createDesktopRpcRouter();
 const response=await router.handle(req("apply_profile"));
 assert.equal(response.requestId,"r-1");
 assert.equal(response.error?.code,RPC_ERRORS.UNSUPPORTED_METHOD);
 assert.equal(response.result,undefined);
 assert.equal("result"in response,false);
 assert.doesNotMatch(response.error?.message??"",/apply_profile/);
});

test("invalid requests fail as invalid_request and still carry a correlatable id",async()=>{
 const router=createDesktopRpcRouter();
 const responses=await Promise.all([
  router.handle({requestId:"good-id",method:"Bad/Method"} as unknown as DesktopRpcRequest),
  router.handle({method:"list_jobs"} as unknown as DesktopRpcRequest),
  router.handle(null as unknown as DesktopRpcRequest),
  router.handle("list_jobs" as unknown as DesktopRpcRequest),
 ]);
 for(const response of responses)assert.equal(response.error?.code,RPC_ERRORS.INVALID_REQUEST);
 assert.equal(responses[0]?.requestId,"good-id");
 for(const response of responses.slice(1))assert.equal(response.requestId,null);
});

test("an uncorrelatable request still answers with an explicit null requestId",async()=>{
 const router=createDesktopRpcRouter();
 for(const raw of [{}, {requestId:"",method:"list_jobs"}, {requestId:7,method:"list_jobs"}, {requestId:"x".repeat(MAX_REQUEST_ID_LENGTH+1),method:"list_jobs"}]){
  const response=await router.handle(raw as unknown as DesktopRpcRequest);
  assert.equal(response.requestId,null,JSON.stringify(raw));
  assert.equal(response.error?.code,RPC_ERRORS.INVALID_REQUEST);
  assert.match(response.error?.message??"",/\S/);
  assert.equal("result"in response,false);
 }
});

test("handler failures become internal_error with a sanitized one-line message",async()=>{
 const router=createDesktopRpcRouter();
 const secret="C:\\Users\\private\\session-transcript.json";
 router.register("boom",()=>{const error=Error(`permission denied for ${secret}\n    at Object.<anonymous> (${secret}:44:9)\n    at run (node:internal/main/run)`);throw error;});
 const response=await router.handle(req("boom"));
 assert.equal(response.requestId,"r-1");
 assert.equal(response.error?.code,RPC_ERRORS.INTERNAL_ERROR);
 const message=response.error?.message??"";
 assert.doesNotMatch(message,/secret|Users|private|session-transcript|internal\/main/);
 assert.doesNotMatch(message,/desktop-rpc\.test\.ts|at Object|at run/);
 assert.equal(message.includes("\n"),false);
 assert.ok(message.length<=MAX_ERROR_MESSAGE_CHARS);
 assert.ok(message.length>0);
 assert.equal(response.result,undefined);
});

test("non-Error throws and rejections still yield a bounded internal_error",async()=>{
 const router=createDesktopRpcRouter();
 router.register("throw_string",()=>{throw"plain failure";});
 router.register("throw_object",()=>{throw{code:"weird"};});
 router.register("reject",async()=>{throw Error("async failure");});
 router.register("throw_empty",()=>{throw new Error("");});
 assert.equal((await router.handle(req("throw_string"))).error?.message,"plain failure");
 assert.equal((await router.handle(req("throw_object"))).error?.message,"desktop rpc handler failed");
 assert.equal((await router.handle(req("reject"))).error?.code,RPC_ERRORS.INTERNAL_ERROR);
 assert.match((await router.handle(req("throw_empty"))).error?.message??"",/desktop rpc handler failed/);
 assert.equal((await router.handle(req("throw_object"))).error?.code,RPC_ERRORS.INTERNAL_ERROR);
});

test("long handler messages are truncated instead of echoed in full",async()=>{
 const router=createDesktopRpcRouter();
 const verbose="detail ".repeat(500);
 router.register("verbose",()=>{throw Error(verbose);});
 const message=(await router.handle(req("verbose"))).error?.message??"";
 assert.equal(message.length,MAX_ERROR_MESSAGE_CHARS);
 assert.equal(verbose.startsWith(message),true);
});

test("concurrent requests are dispatched independently with no queuing",async()=>{
 const router=createDesktopRpcRouter();
 const order:string[]=[];
 router.register("slow",async params=>{await new Promise(resolve=>setTimeout(resolve,40));order.push("slow");return {tag:params.tag};});
 router.register("fast",async params=>{order.push("fast");return {tag:params.tag};});
 router.register("boom",()=>{throw Error("boom failed");});
 const settled=await Promise.all([
  router.handle({requestId:"a",method:"slow",params:{tag:1}}),
  router.handle({requestId:"b",method:"boom"}),
  router.handle({requestId:"c",method:"fast",params:{tag:3}}),
 ]);
 assert.deepEqual(settled[0],{requestId:"a",result:{tag:1}});
 assert.equal(settled[1]?.error?.code,RPC_ERRORS.INTERNAL_ERROR);
 assert.deepEqual(settled[2],{requestId:"c",result:{tag:3}});
 assert.deepEqual(order,["fast","slow"]);
});

test("router keeps no shared per-request state across sequential calls",async()=>{
 const router=createDesktopRpcRouter();
 let calls=0;
 router.register("count",()=>({calls:++calls}));
 assert.deepEqual(await router.handle({requestId:"one",method:"count"}),{requestId:"one",result:{calls:1}});
 assert.deepEqual(await router.handle({requestId:"two",method:"count",params:{x:1}}),{requestId:"two",result:{calls:2}});
 assert.deepEqual([...router.listMethods()],["count","get_permission_mode","get_snapshot","list_jobs","list_subagents"]);
});
