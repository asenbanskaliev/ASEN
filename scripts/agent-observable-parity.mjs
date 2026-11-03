/**
 * EF-003: deterministic comparison of observable agent decisions, not prose.
 * This reports MATCH / FAIL / BLOCKED; it never grants FULL or authorizes work.
 * Claims of real execution still require independent verification of receipts.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REFERENCE_SHA = Object.freeze({
  A: '813ec110600c8451c5f2bb9c35c12d8cf9b1c11e',
  B: 'fd99d8492adb6c23c29f3e9fbd59fc756b76b6ff',
});
export const CASE_IDS = Object.freeze(Array.from({ length: 20 }, (_, i) => `C${String(i + 1).padStart(2, '0')}`));
const shaPattern = /^[0-9a-f]{40}$/u;
const tokenPattern = /^[a-z0-9][a-z0-9:._/-]{0,119}$/u;
const traceKeys = ['route', 'roles', 'guards', 'checks', 'notifications', 'effects'];
const allowedRoutes = new Set(['direct', 'plan', 'delegate', 'verify', 'incident', 'blocked', 'none']);
const allowedRoles = new Set(['primary', 'explorer', 'planner', 'writer', 'reviewer', 'verifier']);

function exactKeys(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).sort().join('|') === [...keys].sort().join('|');
}
function validatedTrace(trace) {
  assert.ok(exactKeys(trace, traceKeys), 'Observation trace must use exactly the six canonical fields');
  assert.ok(allowedRoutes.has(trace.route), 'Unknown observable route');
  for (const key of traceKeys.slice(1)) {
    assert.ok(Array.isArray(trace[key]) && trace[key].length <= 100, `Invalid ${key} trace`);
    for (const item of trace[key]) {
      assert.ok(typeof item === 'string' && tokenPattern.test(item), `Invalid ${key} token`);
      if (key === 'roles') assert.ok(allowedRoles.has(item), 'Unknown agent role');
    }
  }
  assert.ok(trace.route !== 'none' || traceKeys.slice(1).some(key => trace[key].length),
    'Empty observation cannot establish parity');
  return trace;
}
function validateDocument(document, subject) {
  assert.ok(exactKeys(document, ['schema', 'subject', 'cases']), 'Unexpected observation document shape');
  assert.equal(document.schema, 'asen-agent-observable-v1');
  assert.equal(document.subject, subject);
  assert.ok(Array.isArray(document.cases) && document.cases.length <= CASE_IDS.length * (subject === 'reference' ? 2 : 1),
    'Observation cases exceed the acceptance matrix');
  const cases = new Map();
  for (const entry of document.cases) {
    assert.ok(exactKeys(entry, ['id', 'source', 'sha', 'execution', 'environment', 'model', 'receipt', 'trace']),
      'Observation entry requires exact provenance and trace fields');
    const key = subject === 'reference' ? `${entry.id}:${entry.source}` : entry.id;
    assert.ok(CASE_IDS.includes(entry.id) && !cases.has(key), 'Unknown or duplicate acceptance case');
    assert.ok(subject === 'reference' ? Object.hasOwn(REFERENCE_SHA, entry.source) : entry.source === 'ASEN',
      'Observation source does not match document subject');
    assert.ok(typeof entry.sha === 'string' && shaPattern.test(entry.sha), 'Observation requires a full commit SHA');
    assert.ok(['real', 'simulated', 'static'].includes(entry.execution), 'Invalid execution classification');
    for (const key of ['environment', 'model', 'receipt']) {
      assert.ok(typeof entry[key] === 'string' && entry[key].trim() === entry[key] &&
        entry[key].length > 0 && entry[key].length <= 2048 && !/[\u0000-\u001f\u007f]/u.test(entry[key]),
        `Invalid observation ${key}`);
    }
    validatedTrace(entry.trace);
    cases.set(key, entry);
  }
  return cases;
}

/** EF-701: compare the SAME C01–C20 scenario against both frozen A and B,
 * and the exact ASEN commit. A missing reference cannot be silently replaced by
 * the other reference. MATCH is observable agreement, NEVER a FULL attestation.
 */
export function compareAgentObservations({reference,candidate,candidateSha}) {
 assert.ok(typeof candidateSha === 'string' && shaPattern.test(candidateSha),
  'Comparison requires a precise ASEN candidate commit');
 const refs=validateDocument(reference,'reference');
 const local=validateDocument(candidate,'asen');
 const results=CASE_IDS.map(id=>{
  const a=refs.get(`${id}:A`),b=refs.get(`${id}:B`),asen=local.get(id);
  if(!a||!b||!asen)return {id,status:'BLOCKED',
   reason:!a?'REFERENCE_A_MISSING':!b?'REFERENCE_B_MISSING':'ASEN_MISSING'};
  if(a.sha!==REFERENCE_SHA.A)return {id,status:'BLOCKED',reason:'REFERENCE_A_SHA_STALE'};
  if(b.sha!==REFERENCE_SHA.B)return {id,status:'BLOCKED',reason:'REFERENCE_B_SHA_STALE'};
  if(asen.sha!==candidateSha)return {id,status:'BLOCKED',reason:'ASEN_SHA_STALE'};
  if(a.execution!=='real'||b.execution!=='real'||asen.execution!=='real')
   return {id,status:'BLOCKED',reason:'REAL_EXECUTION_NOT_PROVEN'};
  const ab=traceKeys.filter(key=>JSON.stringify(a.trace[key])!==JSON.stringify(b.trace[key]));
  if(ab.length)return {id,status:'FAIL',reason:'REFERENCE_A_B_BEHAVIOR_DIFFERS',
   referenceAReceipt:a.receipt,referenceBReceipt:b.receipt,asenReceipt:asen.receipt,differences:ab};
  const ac=traceKeys.filter(key=>JSON.stringify(a.trace[key])!==JSON.stringify(asen.trace[key]));
  if(ac.length)return {id,status:'FAIL',reason:'ASEN_BEHAVIOR_DIFFERS',
   referenceAReceipt:a.receipt,referenceBReceipt:b.receipt,asenReceipt:asen.receipt,differences:ac};
  return {id,status:'MATCH',referenceAReceipt:a.receipt,referenceBReceipt:b.receipt,asenReceipt:asen.receipt};
 });
 const counts=Object.fromEntries(['MATCH','FAIL','BLOCKED'].map(status=>
  [status.toLowerCase(),results.filter(row=>row.status===status).length]));
 return {
  schema:'asen-agent-observable-comparison-v2',candidateSha,baseline:REFERENCE_SHA,
  requiredSources:['A','B','ASEN'],results,counts,
  classification:counts.fail>0?'DIFFERENCES_FOUND':counts.blocked>0?'EVIDENCE_INCOMPLETE':'MATCH_REQUIRES_RECEIPT_AUDIT',
  globalFull:false,
  disclaimer:'A claimed real execution and matching text are not proof of independent receipts, live providers, Writer consent, Pi parent consumption or FULL.',
 };
}

async function main() {
  const [referencePath, candidatePath, sha] = process.argv.slice(2);
  if (!referencePath || !candidatePath || !sha || process.argv.length !== 5)
    throw new Error('Usage: node scripts/agent-observable-parity.mjs <reference.json> <asen.json> <exact-candidate-sha>');
  const [reference, candidate] = await Promise.all([referencePath, candidatePath].map(async p =>
    JSON.parse(await readFile(resolve(p), 'utf8'))));
  const report = compareAgentObservations({ reference, candidate, candidateSha: sha });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  // F7 is fail-closed: even 20 triple matches still require independent receipt audit.
  if (!report.globalFull) process.exitCode = 1;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try { await main(); } catch (error) { console.error(error); process.exitCode = 1; }
}
