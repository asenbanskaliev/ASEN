import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,readFile,rm} from "node:fs/promises";
import {readdirSync,readFileSync} from "node:fs";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {tmpdir} from "node:os";
import {AgentNotificationJournal} from "../src/runtime/agent-notification-journal.js";

// UFC-M2-05 class (a) negative pins. These lock the ALREADY-SHIPPED journal
// transition rules (no production behaviour is added here) and audit that no
// shipped consumer can invent a coordinator confirmation. Coverage-lock tests
// are expected to pass on first run; owner authorization §6 forbids inventing
// a RED when only coverage was missing. Non-vacuity was proven separately by
// temporary scratch mutations of the guard and of a consumer call site.
const subject={id:"agent-1",sessionId:"session-a",projectId:"/project-a",state:"completed"};
const second={id:"agent-2",sessionId:"session-a",projectId:"/project-a",state:"failed"};
async function fixture(t:import("node:test").TestContext){
 const dir=await mkdtemp(join(tmpdir(),"asen-m2-05-"));
 t.after(()=>rm(dir,{force:true,recursive:true}));
 const file=join(dir,"journal.json");
 return {file,journal:new AgentNotificationJournal(file)};
}

test("UFC-M2-05a a duplicate coordinator acknowledgement cannot rewrite the durable proof",async t=>{
 const {file,journal}=await fixture(t);
 const row=await journal.record(subject);
 await journal.claim(row.eventId,subject);
 await journal.markEnqueued(row.eventId,subject);
 assert.equal(await journal.acknowledge(row.eventId,subject,subject.id,"completed"),true);
 const acked=await readFile(file,"utf8");
 // Re-acknowledging the same event is refused and mutates nothing: no second
 // proof, no updatedAt churn, no revision bump for a replayed confirmation.
 assert.equal(await journal.acknowledge(row.eventId,subject,subject.id,"completed"),false);
 assert.equal(await readFile(file,"utf8"),acked,"A duplicate acknowledgement must be byte-stable");
 // Enqueue after acknowledgement is likewise refused on the already-acked row.
 assert.equal(await journal.markEnqueued(row.eventId,subject),false);
 assert.equal(await readFile(file,"utf8"),acked,"Enqueue after acknowledgement must be byte-stable");
});

test("UFC-M2-05a acknowledging one event leaves other durable events untouched",async t=>{
 const {file,journal}=await fixture(t);
 const first=await journal.record(subject);
 const other=await journal.record(second);
 await journal.claim(first.eventId,subject);await journal.markEnqueued(first.eventId,subject);
 await journal.claim(other.eventId,subject);await journal.markEnqueued(other.eventId,subject);
 assert.equal(await journal.acknowledge(first.eventId,subject,subject.id,"completed"),true);
 const afterFirstAck=await readFile(file,"utf8");
 // A stale duplicate for the first event must not touch the second event either.
 assert.equal(await journal.acknowledge(first.eventId,subject,subject.id,"completed"),false);
 assert.equal(await readFile(file,"utf8"),afterFirstAck,"Replayed acks cannot bleed across events");
 const rows=await journal.list(subject);
 const byId=new Map(rows.map(row=>[row.agentId,row.delivery]));
 assert.equal(byId.get("agent-1"),"acknowledged");
 assert.equal(byId.get("agent-2"),"enqueued","Enqueued is not acknowledged for un-acked events");
 // Acking the second event with the first event's identity is rejected.
 await assert.rejects(()=>journal.acknowledge(other.eventId,subject,subject.id,"failed"),/owned terminal/);
 assert.equal((await journal.list(subject)).find(x=>x.agentId==="agent-2")?.delivery,"enqueued");
});

test("UFC-M2-05a enqueued never reads as acknowledged in any shipped projection",async t=>{
 const {file,journal}=await fixture(t);
 const row=await journal.record(subject);
 await journal.claim(row.eventId,subject);
 await journal.markEnqueued(row.eventId,subject);
 // Durable row: delivery stays enqueued; no consumed/acknowledged field appears.
 const reloaded=(await new AgentNotificationJournal(file).list(subject))[0];
 assert.equal(reloaded?.delivery,"enqueued");
 assert.equal(Object.hasOwn(reloaded ?? {},"consumed"),false);
 assert.equal(JSON.parse(await readFile(file,"utf8")).entries[0]?.delivery,"enqueued");
 // The restart projection labels enqueued as inspection-required, never as
 // consumption or writer authorization.
 const review=await journal.recoveryReview(subject);
 assert.equal(review[0]?.disposition,"ENQUEUED_REQUIRES_COORDINATOR_INSPECTION");
 assert.equal(review[0]?.modelConsumedProven,false);
 assert.equal(review[0]?.writerAuthorized,false);
});

// Source-level consumer audit: acknowledge() is the only transition to the
// durable "acknowledged" state, exactly one shipped caller may invoke it, and
// no shipped consumer may assign a delivery value directly.
function scan(dirUrl:URL):{file:string;text:string}[]{
 const out:{file:string;text:string}[]=[];
 const walk=(dir:string)=>{
  for(const entry of readdirSync(dir,{withFileTypes:true})){
   const full=join(dir,entry.name);
   if(entry.isDirectory())walk(full);
   else if(entry.name.endsWith(".ts"))out.push({file:full,text:readFileSync(full,"utf8")});
  }
 };
 walk(fileURLToPath(dirUrl));
 return out;
}

test("UFC-M2-05a shipped consumers cannot invent a coordinator acknowledgement",()=>{
 const sources=[...scan(new URL("../src/",import.meta.url)),...scan(new URL("../extensions/",import.meta.url))];
 assert.ok(sources.length>=40,"Source scan must cover the shipped tree");
 const journalPath=fileURLToPath(new URL("../src/runtime/agent-notification-journal.ts",import.meta.url));
 const callers=sources
  .filter(x=>x.file!==journalPath&&/\.acknowledge\(/.test(x.text))
  .map(x=>x.file.replace(/\\/g,"/"));
 const relative=callers.map(path=>{
  const marker="src/agents/";
  const i=path.indexOf(marker);
  return i===-1?path:path.slice(i);
 });
 // Only the Pi coordinator ack tool may acknowledge; the extension transport
 // path and every other shipped consumer may not.
 assert.deepEqual(relative,["src/agents/pi-agent-tools.ts"],"src/agents/pi-agent-tools.ts is the only shipped acknowledge() caller");
 // The extension consumer path uses enqueue only.
 const asenText=sources.find(x=>x.file.replace(/\\/g,"/").endsWith("extensions/asen.ts"))?.text??"";
 assert.ok(/\.markEnqueued\(/.test(asenText),"the shipped transport consumer marks enqueue");
 assert.ok(!/\.acknowledge\(/.test(asenText),"the shipped transport consumer never acknowledges");
 // No shipped file assigns a delivery value outside the journal module.
 for(const source of sources){
  if(source.file===journalPath)continue;
  assert.ok(!/\.delivery\s*=(?!=)/.test(source.text),`consumer assigns delivery directly: ${source.file}`);
 }
});
