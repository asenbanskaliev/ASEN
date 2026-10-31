import test from "node:test";
import assert from "node:assert/strict";
import type {HistoryEntry} from "../src/runtime/history.js";
import {cancelHistorySelection,historyUnavailable,normalizeHistoryQuery,projectHistory,selectHistoryEntry} from "../src/runtime/history-selector.js";

const entry=(id:string,projectId="p",text=id,createdAt=`2026-10-06T00:00:00Z`):HistoryEntry=>({id,sessionId:`session-${id}`,projectId,text,createdAt,redacted:id==="redacted"});

test("selector isolates projects and exposes only immutable privacy-safe rows",()=>{
 const entries=[entry("foreign","other","foreign secret"),entry("local","p","local text")],before=structuredClone(entries);
 const result=projectHistory(entries,"p",normalizeHistoryQuery(""),3);
 assert.equal(result.state,"data");if(result.state!=="data")return;
 assert.deepEqual(result.rows,[{id:"local",timestamp:"2026-10-06T00:00:00Z",redacted:false,preview:"local text"}]);
 assert.deepEqual(Object.keys(result.rows[0]!).sort(),["id","preview","redacted","timestamp"]);
 assert.equal(Object.isFrozen(result.rows[0]),true);assert.equal(Object.isFrozen(result.rows),true);
 assert.deepEqual(entries,before);assert.doesNotMatch(JSON.stringify(result),/session-|projectId|foreign secret/);
});

test("preview sanitizes terminal, control, bidi, format, and multiline content before truncation",()=>{
 const hostile="\u001b[31mRED\u001b[0m\u001b]0;title\u0007 line\u0000one\u0085two\u202Eevil\u200B\r\nnext "+"x".repeat(300);
 const result=projectHistory([entry("safe","p",hostile)],"p","",3);assert.equal(result.state,"data");if(result.state!=="data")return;
 const preview=result.rows[0]!.preview;
 assert.ok(Array.from(preview).length<=160);assert.doesNotMatch(preview,/\x1b|\[31m|title|[\u0000-\u001f\u007f-\u009f]|\p{Cf}/u);
 assert.match(preview,/RED line one twoevil next/);assert.ok(preview.endsWith("…"));
});

test("control strings discard complete, nested, interrupted, and unterminated secret payloads",()=>{
 const secret="PRIVATE-MARKER",esc="\u001b",st=`${esc}\\`;
 const controls=["]","P","_","^","X"],c1=["\u009d","\u0090","\u009f","\u009e","\u0098"];
 const samples=[
  ...controls.flatMap(code=>[`${esc}${code}${secret}\u0007 safe`,`${esc}${code}${secret}${st} safe`]),
  ...c1.flatMap(code=>[`${code}${secret}\u0007 safe`,`${code}${secret}\u009c safe`]),
  `${esc}]outer ${esc}P${secret}${st} hidden${st} safe`,
  `${esc}]interrupted ${esc}[31m ${secret}${st} safe`,
  `${esc}]split ${secret}${esc+"\\"} safe`,
  `visible ${esc}]unterminated ${secret}`,
 ];
 for(const [index,text] of samples.entries()){
  const result=projectHistory([entry(`control-${index}`,"p",text)],"p","",3);assert.equal(result.state,"data");if(result.state!=="data")continue;
  assert.doesNotMatch(result.rows[0]!.preview,/PRIVATE-MARKER|outer|hidden|interrupted|unterminated/);
 }
});

test("normalized search paginates recent-first with deterministic opaque cursors",()=>{
 const entries=[entry("a","p","needle"),entry("b","p","NEEDLE"),entry("foreign","q","needle"),entry("c","p","needle"),entry("d","p","needle"),entry("e","p","needle")];
 const query=normalizeHistoryQuery("  NeEdLe  ");assert.equal(query,"needle");
 const first=projectHistory(entries,"p",query,3);assert.equal(first.state,"data");if(first.state!=="data")return;
 assert.deepEqual(first.rows.map(row=>row.id),["e","d","c"]);assert.ok(first.nextCursor);assert.match(first.nextCursor!,/^history\.v2\.[0-9a-z]+\.[a-f0-9]{64}$/u);
 const repeated=projectHistory(entries,"p",query,3);assert.deepEqual(repeated,first);
 assert.throws(()=>projectHistory(entries,"other-project",query,3,first.nextCursor),/cursor/);
 assert.throws(()=>projectHistory(entries,"p","different",3,first.nextCursor),/cursor/);
 assert.throws(()=>projectHistory(entries,"p",query,4,first.nextCursor),/cursor/);
 const tampered=first.nextCursor!.replace(".3.",".4.");assert.throws(()=>projectHistory(entries,"p",query,3,tampered),/cursor/);
 const forged=first.nextCursor!.replace(/[a-f0-9]{64}$/u,"0".repeat(64));assert.throws(()=>projectHistory(entries,"p",query,3,forged),/cursor/);
 const changed=entries.map(value=>value.id==="a"?{...value,text:"needle changed"}:value);
 assert.throws(()=>projectHistory(changed,"p",query,3,first.nextCursor),/cursor/);
 const second=projectHistory(entries,"p",query,3,first.nextCursor);assert.equal(second.state,"data");if(second.state!=="data")return;
 assert.deepEqual(second.rows.map(row=>row.id),["b","a"]);assert.equal(second.nextCursor,undefined);
});

test("selector enforces query, page, cursor, and preview bounds",()=>{
 assert.throws(()=>normalizeHistoryQuery("x".repeat(513)),/query/);
 assert.throws(()=>projectHistory([],"p","",2),/page size/);assert.throws(()=>projectHistory([],"p","",21),/page size/);
 assert.throws(()=>projectHistory([entry("a")],"p","",3,"not-a-cursor"),/cursor/);
});

test("selection recomputes the exact current page from source and grants no authority",()=>{
 const entries=[entry("page-1","p"),entry("page-2","p"),entry("foreign","q"),entry("page-3","p"),entry("page-4","p")];
 const first=projectHistory(entries,"p","",3);assert.equal(first.state,"data");if(first.state!=="data")return;
 const selected=selectHistoryEntry(entries,"p","",3,"page-4");
 assert.deepEqual(selected,{state:"selected",id:"page-4",deletionAuthorized:false});assert.equal(Object.isFrozen(selected),true);
 assert.throws(()=>selectHistoryEntry(entries,"p","",3,"foreign"),/selection/);
 assert.throws(()=>selectHistoryEntry(entries,"p","",3,"arbitrary-valid-id"),/selection/);
 assert.throws(()=>selectHistoryEntry(entries,"p","",3,"page-1"),/selection/);
 assert.deepEqual(selectHistoryEntry(entries,"p","",3,"page-1",first.nextCursor),{state:"selected",id:"page-1",deletionAuthorized:false});
 assert.throws(()=>selectHistoryEntry(entries,"p","",3,"page-4",first.nextCursor),/selection/);
});

test("selection rejects forged provenance and genuine IDs stale against a new snapshot",()=>{
 const original=[entry("old","p"),entry("keep-1","p"),entry("keep-2","p"),entry("keep-3","p")];
 const genuine=projectHistory(original,"p","",3);assert.equal(genuine.state,"data");
 const forged=Object.freeze({state:"data",rows:Object.freeze([Object.freeze({id:"arbitrary",timestamp:"2026-10-06T00:00:00Z",redacted:false,preview:"fake"})])});
 assert.throws(()=>selectHistoryEntry(forged as unknown as readonly HistoryEntry[],"p","",3,"arbitrary"),/selection/);
 const removed=original.filter(value=>value.id!=="keep-3");assert.throws(()=>selectHistoryEntry(removed,"p","",3,"keep-3"),/selection/);
 const reordered=[...original,entry("new-1"),entry("new-2"),entry("new-3")];assert.throws(()=>selectHistoryEntry(reordered,"p","",3,"keep-3"),/selection/);
});

test("empty, unavailable, and cancelled states are deterministic and expose no identifier",()=>{
 const empty=projectHistory([entry("foreign","q")],"p","",3),unavailable=historyUnavailable(),cancelled=cancelHistorySelection();
 assert.deepEqual(empty,{state:"empty",rows:[]});assert.deepEqual(unavailable,{state:"unavailable",rows:[]});assert.deepEqual(cancelled,{state:"cancelled"});
 assert.equal("id" in empty,false);assert.equal("id" in cancelled,false);assert.equal("id" in unavailable,false);
});
