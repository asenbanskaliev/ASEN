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
  const report = compareAgentObservations(pair([entry('C01','A')],[entry('C01')]));
  assert.equal(report.results[0].status,'MATCH');
  assert.equal(report.counts.match,1);
  assert.equal(report.counts.blocked,19);
  assert.equal(report.globalFull,false);
});
test('EF-003 mismatched permit/effect never passes through free-text normalization', () => {
  const altered=entry('C17','ASEN',{trace:{...trace(),guards:['writer:allowed'],effects:['write:1']}});
  const report=compareAgentObservations(pair([entry('C17','B')],[altered]));
  assert.equal(report.results[16].status,'FAIL');
  assert.deepEqual(report.results[16].differences,['guards','effects']);
});
test('EF-003 static or simulated observations cannot claim real equivalence', () => {
  for(const execution of ['static','simulated']){
    const report=compareAgentObservations(pair([entry('C01','A',{execution})],[entry('C01')]));
    assert.equal(report.results[0].status,'BLOCKED');
    assert.equal(report.results[0].reason,'REAL_EXECUTION_NOT_PROVEN');
  }
});
test('EF-003 candidate and reference evidence cannot be reused across SHA', () => {
  let result=compareAgentObservations(pair([entry('C01','B',{sha:'b'.repeat(40)})],[entry('C01')]));
  assert.equal(result.results[0].reason,'REFERENCE_SHA_STALE');
  result=compareAgentObservations(pair([entry('C01','A')],[entry('C01','ASEN',{sha:'b'.repeat(40)})]));
  assert.equal(result.results[0].reason,'ASEN_SHA_STALE');
});
test('EF-003 rejects duplicate, unknown and malformed trace records before comparison', () => {
  assert.throws(()=>compareAgentObservations(pair([], [entry('C01'),entry('C01')])),/duplicate/);
  assert.throws(()=>compareAgentObservations(pair([], [entry('C99')])),/Unknown/);
  assert.throws(()=>compareAgentObservations(pair([], [entry('C01','ASEN',{trace:{route:'direct'}})])),/exactly/);
  assert.throws(()=>compareAgentObservations(pair([], [entry('C01','ASEN',{trace:{...trace(),roles:['god']}})])),/role/);
  assert.throws(()=>compareAgentObservations(pair([], [entry('C01','ASEN',{trace:{...trace(),guards:['approve\\nfalse']}})])),/token/);
});
test('EF-003 even 20 matching fixtures cannot directly authorize FULL', () => {
  const ids=CASE_IDS;
  const result=compareAgentObservations(pair(ids.map((id: string)=>entry(id,'A')),ids.map((id: string)=>entry(id))));
  assert.equal(result.counts.match,20);
  assert.equal(result.globalFull,false);
  assert.equal(result.classification,'MATCH_REQUIRES_RECEIPT_AUDIT');
});
