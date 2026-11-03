import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error This provider-free parity comparator is deliberately JavaScript-only.
import {compareAgentObservations, REFERENCE_SHA, CASE_IDS} from '../scripts/agent-observable-parity.mjs';

const current = 'a'.repeat(40);
const trace = () => ({route:'direct',roles:[],guards:['writer:denied'],checks:[],notifications:[],effects:[]});
const entry = (id: string, side: 'A'|'B'|'ASEN' = 'ASEN', overrides: Record<string, unknown> = {}) => ({
  id, source:side, sha:side === 'ASEN' ? current : REFERENCE_SHA[side], execution:'real',
  environment:'linux-isolated',model:'none',receipt:`artifacts/${id}.json`,trace:trace(),...overrides,
});
const document = (subject: string, records: unknown[]) => ({schema:'asen-agent-observable-v1',subject,cases:records});
const pair = (reference: unknown[] = [], candidate: unknown[] = []) => ({
  reference:document('reference',reference),candidate:document('asen',candidate),candidateSha:current,
});

test('EF-003 missing 20 real A/B scenarios stay BLOCKED, never FULL', () => {
  const report = compareAgentObservations(pair());
  assert.equal(report.counts.blocked,20);
  assert.equal(report.counts.match,0);
  assert.equal(report.globalFull,false);
  assert.equal(report.classification,'EVIDENCE_INCOMPLETE');
  assert.deepEqual(report.results.map((x: {id:string})=>x.id),CASE_IDS);
});
test('EF-003 aligned observable trace is MATCH but cannot certify FULL alone', () => {
  const report = compareAgentObservations(pair([entry('C01','A'),entry('C01','B')],[entry('C01')]));
  assert.equal(report.results[0].status,'MATCH');
  assert.equal(report.counts.match,1);
  assert.equal(report.counts.blocked,19);
  assert.equal(report.globalFull,false);
});
test('EF-003 mismatched permit/effect never passes through free-text normalization', () => {
  const altered=entry('C17','ASEN',{trace:{...trace(),guards:['writer:allowed'],effects:['write:1']}});
  const report=compareAgentObservations(pair([entry('C17','A'),entry('C17','B')],[altered]));
  assert.equal(report.results[16].status,'FAIL');
  assert.deepEqual(report.results[16].differences,['guards','effects']);
});
test('EF-003 static or simulated observations cannot claim real equivalence', () => {
  for(const execution of ['static','simulated']){
    const report=compareAgentObservations(pair([entry('C01','A',{execution}),entry('C01','B')],[entry('C01')]));
    assert.equal(report.results[0].status,'BLOCKED');
    assert.equal(report.results[0].reason,'REAL_EXECUTION_NOT_PROVEN');
  }
});
test('EF-003 candidate and reference evidence cannot be reused across SHA', () => {
  let result=compareAgentObservations(pair([entry('C01','A'),entry('C01','B',{sha:'c'.repeat(40)})],[entry('C01')]));
  assert.equal(result.results[0].reason,'REFERENCE_B_SHA_STALE');
  result=compareAgentObservations(pair([entry('C01','A'),entry('C01','B')],[entry('C01','ASEN',{sha:'b'.repeat(40)})]));
  assert.equal(result.results[0].reason,'ASEN_SHA_STALE');
});
test('EF-003 rejects duplicate, unknown and malformed trace records before comparison', () => {
  assert.throws(()=>compareAgentObservations(pair([], [entry('C01'),entry('C01')])),/duplicate/);
  assert.throws(()=>compareAgentObservations(pair([entry('C01','A'),entry('C01','A')],[])),/duplicate/);
  assert.throws(()=>compareAgentObservations(pair([], [entry('C99')])),/Unknown/);
  assert.throws(()=>compareAgentObservations(pair([], [entry('C01','ASEN',{trace:{route:'direct'}})])),/exactly/);
  assert.throws(()=>compareAgentObservations(pair([], [entry('C01','ASEN',{trace:{...trace(),roles:['god']}})])),/role/);
  assert.throws(()=>compareAgentObservations(pair([], [entry('C01','ASEN',{trace:{...trace(),guards:['approve\\nfalse']}})])),/token/);
});
test('EF-003 even 20 matching fixtures cannot directly authorize FULL', () => {
  const ids=CASE_IDS;
  const result=compareAgentObservations(pair(ids.flatMap((id: string)=>[entry(id,'A'),entry(id,'B')]),ids.map((id: string)=>entry(id))));
  assert.equal(result.counts.match,20);
  assert.equal(result.globalFull,false);
  assert.equal(result.classification,'MATCH_REQUIRES_RECEIPT_AUDIT');
});

test('EF-003 comparator CLI enforces full exact-SHA input and prints BLOCKED (not FULL)', async t => {
  const {mkdtemp,writeFile,rm} = await import('node:fs/promises');
  const {tmpdir} = await import('node:os');
  const {join} = await import('node:path');
  const {spawnSync} = await import('node:child_process');
  const folder=await mkdtemp(join(tmpdir(),'asen-ef003-cli-'));
  t.after(()=>rm(folder,{recursive:true,force:true}));
  const ref=join(folder,'reference.json'),local=join(folder,'candidate.json');
  await writeFile(ref,JSON.stringify(document('reference',[entry('C01','A'),entry('C01','B')])));
  await writeFile(local,JSON.stringify(document('asen',[entry('C01')])));
  const result=spawnSync(process.execPath,['scripts/agent-observable-parity.mjs',ref,local,current],
   {encoding:'utf8',timeout:15000,cwd:process.cwd()});
  assert.equal(result.status,1,'incomplete 20-case evidence must reject overall FULL');
  const report=JSON.parse(result.stdout);
  assert.equal(report.counts.match,1);
  assert.equal(report.counts.blocked,19);
  assert.equal(report.globalFull,false);
  assert.deepEqual(report.requiredSources,['A','B','ASEN']);
  const malformed=spawnSync(process.execPath,['scripts/agent-observable-parity.mjs',ref,local],
   {encoding:'utf8',timeout:15000,cwd:process.cwd()});
  assert.equal(malformed.status,1);
  assert.match(malformed.stderr,/Usage:/);
});

test('EF-701 a matching A without B is BLOCKED, never equivalent to two references',()=>{
 const result=compareAgentObservations(pair([entry('C01','A')],[entry('C01')]));
 assert.equal(result.results[0].status,'BLOCKED');
 assert.equal(result.results[0].reason,'REFERENCE_B_MISSING');
 assert.equal(result.globalFull,false);
});
test('EF-701 reference A/B divergence is a hard FAIL even when ASEN matches reference A',()=>{
 const different=entry('C11','B',{trace:{...trace(),guards:['writer:allowed']}});
 const report=compareAgentObservations(pair([entry('C11','A'),different],[entry('C11')]));
 assert.equal(report.results[10].status,'FAIL');
 assert.equal(report.results[10].reason,'REFERENCE_A_B_BEHAVIOR_DIFFERS');
 assert.deepEqual(report.results[10].differences,['guards']);
 assert.equal(report.globalFull,false);
});
test('EF-701 static B or stale A fails closed despite real-looking ASEN output',()=>{
 let result=compareAgentObservations(pair([entry('C19','A'),entry('C19','B',{execution:'simulated'})],[entry('C19')]));
 assert.equal(result.results[18].reason,'REAL_EXECUTION_NOT_PROVEN');
 result=compareAgentObservations(pair([entry('C19','A',{sha:'f'.repeat(40)}),entry('C19','B')],[entry('C19')]));
 assert.equal(result.results[18].reason,'REFERENCE_A_SHA_STALE');
});
test('EF-701 all 40 reference observations and 20 ASEN observations still cannot certify FULL',()=>{
 const reference=CASE_IDS.flatMap((id: string)=>[entry(id,'A'),entry(id,'B')]);
 const candidate=CASE_IDS.map((id:string)=>entry(id));
 const report=compareAgentObservations(pair(reference,candidate));
 assert.equal(report.counts.match,20);
 assert.equal(report.counts.blocked,0);
 assert.equal(report.counts.fail,0);
 assert.equal(report.classification,'MATCH_REQUIRES_RECEIPT_AUDIT');
 assert.equal(report.globalFull,false);
 assert.equal(report.results[0].referenceAReceipt,'artifacts/C01.json');
 assert.equal(report.results[0].referenceBReceipt,'artifacts/C01.json');
});
test('EF-701 comparator CLI remains nonzero even with matching 40/20 claimed real JSON fixtures',async t=>{
 const {mkdtemp,writeFile,rm}=await import('node:fs/promises');
 const {tmpdir}=await import('node:os');
 const {join}=await import('node:path');
 const {spawnSync}=await import('node:child_process');
 const directory=await mkdtemp(join(tmpdir(),'asen-parity-triplet-'));
 t.after(()=>rm(directory,{recursive:true,force:true}));
 const refs=join(directory,'ref.json'),asen=join(directory,'asen.json');
 await writeFile(refs,JSON.stringify(document('reference',CASE_IDS.flatMap((id:string)=>[entry(id,'A'),entry(id,'B')]))));
 await writeFile(asen,JSON.stringify(document('asen',CASE_IDS.map((id:string)=>entry(id)))));
 const run=spawnSync(process.execPath,['scripts/agent-observable-parity.mjs',refs,asen,current],
  {cwd:process.cwd(),encoding:'utf8',timeout:20000});
 assert.equal(run.status,1);
 const report=JSON.parse(run.stdout);
 assert.equal(report.counts.match,20);
 assert.equal(report.globalFull,false);
});
