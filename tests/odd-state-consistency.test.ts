import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const read=(name:string):string=>readFileSync(new URL("../"+name,import.meta.url),"utf8");
const capabilities=read("odd/tasks/pi-capability-completion.md");
const memory=read("odd/tasks/memory-strict-parity.md");
const t10=read("docs/t10-completion-plan.md");
const ecosystem=read("odd/tasks/ecosystem-final-parity-map.md");
const claims=JSON.parse(read("registry/parity/ecosystem-claims-v1.json")) as {rows:Array<{id:string;status:string}>};
const extension=read("extensions/asen.ts");
const managed=read("src/runtime/managed-lifecycle.ts");
const codegraph=read("src/interaction/code-intelligence.ts");
const f5=read("odd/tasks/hardening-exact-sha-r4.md");
const f501=read("odd/tasks/hardening-exact-sha-r4/F5-01.md");
const f502=read("odd/tasks/hardening-exact-sha-r4/F5-02.md");

function taskLine(markdown:string,id:string,separator:" |"|" —"=" |"):string{
 const rows=markdown.split(/\r?\n/u).filter(line=>line.startsWith("- [x] "+id+separator)||line.startsWith("- [ ] "+id+separator));
 assert.equal(rows.length,1,"one canonical checkbox must exist for "+id);
 return rows[0]!;
}
function requireChecked(markdown:string,id:string,checked:boolean,separator:" |"|" —"=" |"):string{
 const row=taskLine(markdown,id,separator);
 assert.equal(row.startsWith(checked?"- [x] ":"- [ ] "),true,"incorrect ODD status for "+id);
 return row;
}

test("T07 and T09-U4 are checked only for existing bounded implementation",()=>{
 const t07=requireChecked(capabilities,"T07",true);
 assert.match(t07,/CURRENT: IMPLEMENTED \+ VERIFIED \(bounded ASEN\/Pi CodeGraph/iu);
 assert.match(codegraph,/export function createCodeGraphTool\(/u);
 assert.match(extension,/registerCodeGraphTools\(/u);
 const u4=requireChecked(capabilities,"T09-U4",true);
 assert.match(u4,/IMPLEMENTED \+ BOUNDED TESTED/iu);
 assert.doesNotMatch(u4,/activation\/update\/rollback unfinished/iu);
 for(const operation of ["installManaged","upgradeManaged","rollbackManaged"]){
  assert.ok(managed.includes("export async function "+operation+"("),operation+" must exist");
 }
 assert.match(read("tests/t09-u4-characterization.test.ts"),/upgradeManaged/u);
 assert.match(read("tests/t09-u4-interrupted-upgrade.test.ts"),/upgradeManaged/u);
});

test("T09 aggregate remains PARTIAL and T10 waiver is never FULL evidence",()=>{
 const t09=requireChecked(capabilities,"T09",false);
 assert.match(t09,/PARTIAL aggregate/iu);
 const current=capabilities.split("## Current ODD/code reconciliation checkpoint - 2026-11-01")[1]?.split("## Specs")[0];
 assert.ok(current,"current checkpoint must exist");
 assert.match(current,/T10: ACCEPTED_WITH_WAIVER/u);
 assert.doesNotMatch(current,/T10: FULL\b/u);
 assert.match(t10,/NOT_WIRED/u);
 assert.match(t10,/ACCEPTED_WITH_WAIVER/u);
});

test("legacy MEM checkboxes are reconciled against existing v3 scope, not global parity",()=>{
 for(let n=1;n<=9;n++){
  const row=requireChecked(memory,"MEM-0"+n,true," —");
  assert.match(row,/MEM-0[1-9]/u);
 }
 assert.match(memory,/RECONCILED\/COVERED only for the admitted local memory-v3 core/u);
 assert.match(memory,/Optional interface\/provider claims remain bounded/i);
 assert.match(read("src/memory/sqlite-store.ts"),/class SqliteMemoryStore/u);
});

test("notification bus is explicitly non-production; durable background enqueue must not imply delivery",()=>{
 const bus=read("src/runtime/session-notifications.ts");
 assert.match(bus,/export class SessionNotificationBus/u);
 assert.doesNotMatch(extension,/\bSessionNotificationBus\b/u);
 assert.match(extension,/pendingBackgroundJobNotifications\(/u);
 assert.match(extension,/deliveryConfirmed:false/u);
 assert.match(extension,/setDeliveryStateScoped\(result\.id,result\.sessionId,result\.projectId,"enqueued"\)/u);
 assert.match(t10,/NOT_WIRED/u);
 assert.match(t10,/not import or register that bus/u);
 assert.match(read("tests/background-job-journal-corruption.test.ts"),/truncateSync\(file, 2 \* 1024 \* 1024 \+ 1\)/u);
});

test("bounded acceptance does not silently promote ECO or independent R4",()=>{
 assert.equal(claims.rows.length,16);
 for(const row of claims.rows)assert.equal(row.status,"PARTIAL",row.id+" requires independent exact evidence");
 assert.match(ecosystem,/Current T-to-ECO reconciliation - 2026-11-01/u);
 assert.match(ecosystem,/16 PARTIAL \/ 0 FULL/u);
 assert.match(f5,/Reconciliation checkpoint - CI baseline e9229568/u);
 for(const row of [f501,f502])assert.match(row,/^estado: "in_progress"$/mu);
 assert.match(f5,/zero recorded independent review submissions/u);
});

test("detector rejects stale status and cross-scope re-promotion in synthetic text",()=>{
 assert.throws(()=>requireChecked(capabilities.replace("- [x] T07 |","- [ ] T07 |"),"T07",true),/incorrect ODD status/u);
 assert.throws(()=>requireChecked(memory.replace("- [x] MEM-01 —","- [ ] MEM-01 —"),"MEM-01",true," —"),/incorrect ODD status/u);
 assert.throws(()=>requireChecked(capabilities.replace("- [ ] T09 |","- [x] T09 |"),"T09",false),/incorrect ODD status/u);
});
